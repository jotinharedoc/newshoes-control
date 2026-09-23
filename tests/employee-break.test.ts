import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { Prisma, type EmployeeBreakKind, type ProductionStatus } from "../lib/generated/prisma/client";
import { prisma } from "./fake-prisma";
import { startEmployeeBreak, finishEmployeeBreak, getEmployeeBreakOverview } from "../services/employee-break.service";
import { startHygieneProduction, changeHygieneProductionState } from "../services/production.service";
import { startFinalizationProduction, changeFinalizationProductionState } from "../services/finalization.service";
import { startPaintingProduction, changePaintingProductionState } from "../services/painting.service";
import { changeReturnState } from "../services/return.service";

afterEach(() => mock.restoreAll());

for (const kind of ["BATHROOM", "LUNCH"] as const) {
  test(`funcionário operacional pode iniciar ${kind}`, async () => {
    fixture(null);
    const result = await startEmployeeBreak("employee", kind);
    assert.equal(result.current?.kind, kind);
  });
  test(`perfil de gerência não pode iniciar ${kind}, independentemente do nome`, async () => {
    fixture(null);
    mock.method(prisma.employee, "findFirst", async (args: Prisma.EmployeeFindFirstArgs) => {
      assert.deepEqual(args.where, { id: "manager", active: true, role: { active: true, permissions: { none: { permission: { code: "management.access" } } } } });
      return null;
    });
    await assert.rejects(startEmployeeBreak("manager", kind), { code: "PROCESS_NOT_AUTHORIZED", status: 403 });
    assert.equal((await getEmployeeBreakOverview("manager")).current, null);
  });
}

// Novos registros em memória; nenhuma conexão com o banco da loja.
function fixture(initialStatus: ProductionStatus | null) {
  mock.method(prisma.employee, "findFirst", async () => ({ id: "employee" }));
  const production = { id: "p1", status: initialStatus, version: 0, processTypeId: "process" };
  let current: { id: string; kind: EmployeeBreakKind; startedAt: Date; pausedProductionId: string | null } | null = null;
  const sessions: string[] = [];
  const endings: string[] = [];
  mock.method(prisma.employeeBreak, "findFirst", async () => current);
  mock.method(prisma.employeeBreak, "create", async (args: Prisma.EmployeeBreakCreateArgs) => {
    current = { id: "b1", kind: args.data.kind!, startedAt: args.data.startedAt as Date, pausedProductionId: args.data.pausedProductionId ?? null };
    return current;
  });
  mock.method(prisma.employeeBreak, "updateMany", async () => { current = null; return { count: 1 }; });
  mock.method(prisma.production, "findMany", async () =>
    production.status === "IN_PROGRESS" || production.status === "PAUSED" ? [production] : []);
  mock.method(prisma.production, "findFirst", async () => ({ ...production, sessions: [] }));
  mock.method(prisma.production, "updateMany", async (args: Prisma.ProductionUpdateManyArgs) => {
    assert.equal(args.where?.version, production.version);
    production.status = args.data.status as ProductionStatus;
    production.version++;
    return { count: 1 };
  });
  mock.method(prisma.workSession, "updateMany", async (args: Prisma.WorkSessionUpdateManyArgs) => {
    endings.push(args.data.endReason as string);
    return { count: 1 };
  });
  mock.method(prisma.workSession, "create", async (args: Prisma.WorkSessionCreateArgs) => {
    sessions.push(args.data.kind!);
    return { id: "session" };
  });
  mock.method(prisma.employeeProcess, "findFirst", async () => ({ processType: { id: "process", rules: [{ commissionAmount: new Prisma.Decimal("0.50") }] } }));
  return { production, sessions, endings };
}

for (const kind of ["BATHROOM", "LUNCH"] as const) {
  for (const status of [null, "IN_PROGRESS", "PAUSED"] as const) {
    test(`${kind} com trabalho ${status ?? "ausente"}: encerra sem comissão e aplica a retomada correta`, async () => {
      const state = fixture(status);
      const opened = await startEmployeeBreak("employee", kind);
      assert.equal(opened.current?.kind, kind);
      assert.equal(opened.current?.pausedProductionId, status && (kind === "LUNCH" || status === "IN_PROGRESS") ? "p1" : null);
      assert.deepEqual(state.endings, status === "IN_PROGRESS" ? [kind === "LUNCH" ? "LUNCH" : "PAUSE"] : []);
      assert.equal(state.production.status, status ? (kind === "LUNCH" ? "DEFERRED" : "PAUSED") : null);
      await assert.rejects(startEmployeeBreak("employee", kind), { code: "INVALID_PRODUCTION_STATE" });
      const closed = await finishEmployeeBreak("employee", "b1");
      assert.equal(closed.current, null);
      assert.equal(state.production.status, status ? (kind === "LUNCH" ? "DEFERRED" : status) : null);
      assert.deepEqual(state.sessions, kind === "BATHROOM" && status === "IN_PROGRESS" ? ["RESUME"] : []);
      await assert.rejects(finishEmployeeBreak("employee", "b1"), { code: "PRODUCTION_CONFLICT" });
    });
  }

  test(`${kind} bloqueia início e ações de trabalho nos três processos e retornos`, async () => {
    fixture(null);
    await startEmployeeBreak("employee", kind);
    const attempts = [
      () => startHygieneProduction("employee", "1234"),
      () => startFinalizationProduction("employee", "1234", "PAIR"),
      () => startPaintingProduction("employee", "1234"),
      ...(["resume", "continue", "finish"] as const).flatMap(action => [
        () => changeHygieneProductionState("employee", "p1", 0, action),
        () => changeFinalizationProductionState("employee", "p1", 0, action),
        () => changePaintingProductionState("employee", "p1", 0, action),
      ]),
      ...(["start", "resume", "finish"] as const).map(action => () => changeReturnState("employee", "p1", 0, action)),
    ];
    for (const attempt of attempts) {
      await assert.rejects(attempt(), { code: "INVALID_PRODUCTION_STATE", status: 409 });
    }
  });
}

test("banheiro encerra sem retomar se a permissão foi removida", async () => {
  const state = fixture("IN_PROGRESS");
  await startEmployeeBreak("employee", "BATHROOM");
  mock.method(prisma.employeeProcess, "findFirst", async () => null);
  assert.equal((await finishEmployeeBreak("employee", "b1")).current, null);
  assert.equal(state.production.status, "PAUSED");
  assert.deepEqual(state.sessions, []);
});
