import assert from "node:assert/strict";
import { mock } from "node:test";
import { Prisma, type ProductionKind, type ProductionStatus, type SessionKind, type WorkUnit } from "../lib/generated/prisma/client";
import { prisma } from "./fake-prisma";

type Session = { id: string; kind: SessionKind; startedAt: Date; endedAt: Date | null; endReason: string | null };
export type WorkRecord = {
  id: string; employeeId: string; processTypeId: string; shoeId: string;
  kind: ProductionKind; status: ProductionStatus; unit: WorkUnit; version: number;
  sourceProductionId: string | null; returnReason: string | null;
  commissionAmountSnapshot: Prisma.Decimal; startedAt: Date; completedAt: Date | null;
  sessions: Session[];
};
type Break = { id: string; employeeId: string; kind: string; pausedProductionId: string | null; startedAt: Date; endedAt: Date | null };

// Somente a persistência é simulada: os fluxos chamam services/repositories reais.
export function workflowFixture() {
  mock.method(prisma.employee, "findFirst", async () => ({ id: "workflow-employee" }));
  const employeeId = "workflow-employee";
  const records: WorkRecord[] = [];
  const breaks: Break[] = [];
  const commissions: { productionId: string; amount: string }[] = [];
  const shoes = new Map<string, string>();
  const processes = ["Higienização", "Finalização", "Pintura"].map(name => ({
    id: name, name,
    rules: (name === "Finalização" ? ["PAIR", "LEFT_FOOT", "RIGHT_FOOT"] : ["PAIR"]).map(unit => ({
      unit,
      commissionAmount: new Prisma.Decimal(name === "Pintura" ? "1.00" : unit === "PAIR" ? "0.50" : "0.25"),
    })),
  }));
  let sequence = 0;
  function matches(record: Record<string, unknown>, where: Record<string, unknown> = {}): boolean {
    return Object.entries(where).every(([key, condition]) => {
      const value = record[key];
      if (condition && typeof condition === "object" && !(condition instanceof Date)) {
        const filter = condition as Record<string, unknown>;
        if ("in" in filter) return (filter.in as unknown[]).includes(value);
        if ("not" in filter) return value !== filter.not;
        return Boolean(value && typeof value === "object" && matches(value as Record<string, unknown>, filter));
      }
      return value === condition;
    });
  }
  function view(record: WorkRecord, query?: { select?: unknown }) {
    const select = query?.select as { sessions?: { where?: { endedAt?: null } } } | undefined;
    return {
      ...record,
      shoe: { code: shoes.get(record.shoeId) ?? record.shoeId },
      employee: { id: employeeId, name: "Teste operacional" },
      processType: { id: record.processTypeId, name: record.processTypeId },
      sessions: record.sessions.filter(s => !select?.sessions?.where || s.endedAt === null).map(s => ({ ...s })),
    };
  }
  function selected(query?: { where?: unknown; select?: unknown }) {
    return records.filter(record => matches(view(record), query?.where as Record<string, unknown>)).map(record => view(record, query));
  }
  mock.method(prisma.employeeProcess, "findFirst", async (args: Prisma.EmployeeProcessFindFirstArgs) => {
    const processFilter = args.where?.processType as { name?: string } | undefined;
    const process = processes.find(p => p.id === args.where?.processTypeId || p.name === processFilter?.name) ?? processes[0];
    return { employeeId, processType: process };
  });
  mock.method(prisma.production, "findFirst", async (args: Prisma.ProductionFindFirstArgs) => selected(args)[0] ?? null);
  mock.method(prisma.production, "findMany", async (args: Prisma.ProductionFindManyArgs) => selected(args));
  mock.method(prisma.shoe, "upsert", async (args: Prisma.ShoeUpsertArgs) => {
    const id = `shoe-${args.where.code}`;
    shoes.set(id, args.where.code!);
    return { id };
  });
  mock.method(prisma.production, "create", async (args: Prisma.ProductionCreateArgs) => {
    const data = args.data as Prisma.ProductionUncheckedCreateInput;
    const initialSession = data.sessions?.create as Prisma.WorkSessionCreateWithoutProductionInput | undefined;
    const record: WorkRecord = {
      id: `work-${++sequence}`, employeeId: data.employeeId, processTypeId: data.processTypeId,
      shoeId: data.shoeId, kind: data.kind, unit: data.unit,
      status: data.status ?? "IN_PROGRESS", version: 0,
      sourceProductionId: data.sourceProductionId ?? null, returnReason: data.returnReason ?? null,
      commissionAmountSnapshot: new Prisma.Decimal(data.commissionAmountSnapshot.toString()),
      startedAt: data.startedAt as Date, completedAt: null,
      sessions: initialSession ? [{ id: `session-${++sequence}`, kind: initialSession.kind, startedAt: initialSession.startedAt as Date, endedAt: null, endReason: null }] : [],
    };
    records.push(record);
    return view(record);
  });
  mock.method(prisma.production, "updateMany", async (args: Prisma.ProductionUpdateManyArgs) => {
    const found = records.filter(record => matches(view(record), args.where as Record<string, unknown>));
    for (const record of found) {
      record.status = args.data.status as ProductionStatus;
      record.version++;
      if (args.data.completedAt) record.completedAt = args.data.completedAt as Date;
    }
    return { count: found.length };
  });
  mock.method(prisma.workSession, "create", async (args: Prisma.WorkSessionCreateArgs) => {
    const productionId = (args.data as Prisma.WorkSessionUncheckedCreateInput).productionId;
    const record = records.find(r => r.id === productionId)!;
    assert.equal(record.sessions.filter(s => !s.endedAt).length, 0, "não abre duas sessões no mesmo trabalho");
    const session: Session = { id: `session-${++sequence}`, kind: args.data.kind, startedAt: args.data.startedAt as Date, endedAt: null, endReason: null };
    record.sessions.push(session);
    return session;
  });
  mock.method(prisma.workSession, "updateMany", async (args: Prisma.WorkSessionUpdateManyArgs) => {
    const record = records.find(r => r.id === args.where?.productionId);
    const open = record?.sessions.filter(s => !s.endedAt) ?? [];
    for (const session of open) {
      session.endedAt = args.data.endedAt as Date;
      session.endReason = args.data.endReason as string;
    }
    return { count: open.length };
  });
  mock.method(prisma.commissionEntry, "create", async (args: Prisma.CommissionEntryCreateArgs) => {
    const data = args.data as Prisma.CommissionEntryUncheckedCreateInput;
    assert.equal(records.find(r => r.id === data.productionId)?.kind, "STANDARD");
    assert.equal(commissions.some(c => c.productionId === data.productionId), false);
    commissions.push({ productionId: data.productionId, amount: data.amount.toString() });
    return { id: `commission-${++sequence}` };
  });
  mock.method(prisma.employeeBreak, "findFirst", async (args: Prisma.EmployeeBreakFindFirstArgs) => breaks.find(b => matches(b, args.where as Record<string, unknown>)) ?? null);
  mock.method(prisma.employeeBreak, "create", async (args: Prisma.EmployeeBreakCreateArgs) => {
    const data = args.data as Prisma.EmployeeBreakUncheckedCreateInput;
    const item = { id: `break-${++sequence}`, employeeId: data.employeeId, kind: data.kind!, pausedProductionId: data.pausedProductionId ?? null, startedAt: data.startedAt as Date, endedAt: null };
    breaks.push(item);
    return item;
  });
  mock.method(prisma.employeeBreak, "updateMany", async (args: Prisma.EmployeeBreakUpdateManyArgs) => {
    const open = breaks.filter(b => matches(b, args.where as Record<string, unknown>));
    for (const item of open) item.endedAt = args.data.endedAt as Date;
    return { count: open.length };
  });
  return { employeeId, records, breaks, commissions };
}
