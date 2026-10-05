import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { Prisma } from "../lib/generated/prisma/client";
import { prisma } from "./fake-prisma";
import { workflowFixture } from "./workflow-fixture";
import { reopenEmployeeWork, getEmployeeDayWorks } from "../services/employee-work.service";
import { startHygieneProduction, changeHygieneProductionState, finishAndStartNextHygieneProduction } from "../services/production.service";
import { startFinalizationProduction, changeFinalizationProductionState } from "../services/finalization.service";
import { startPaintingProduction, changePaintingProductionState } from "../services/painting.service";
import { startEmployeeBreak } from "../services/employee-break.service";
import { productionDay, sessionActiveToday } from "../utils/production-day";

afterEach(() => { mock.restoreAll(); mock.timers.reset(); });
const start = new Date("2026-10-03T11:00:00Z");
const finishAt = new Date("2026-10-03T11:20:00Z");
const resumeAt = new Date("2026-10-03T12:00:00Z");

const cases = [
  { name: "Higienização", unit: "PAIR", start: (id: string) => startHygieneProduction(id, "000123"), change: changeHygieneProductionState },
  ...(["PAIR", "LEFT_FOOT", "RIGHT_FOOT"] as const).map(unit => ({ name: "Finalização", unit, start: (id: string) => startFinalizationProduction(id, "00092420260001", unit), change: changeFinalizationProductionState })),
  { name: "Pintura", unit: "PAIR", start: (id: string) => startPaintingProduction(id, "33333333333333"), change: changePaintingProductionState },
];
for (const process of cases) test(`${process.name} ${process.unit}: reabre a mesma produção, preserva tempo e comissão ao concluir novamente`, async () => {
  const f = workflowFixture();
  mock.timers.enable({ apis: ["Date"], now: start });
  await process.start(f.employeeId);
  const record = f.records[0];
  const ids = [record.id, record.shoeId, record.unit, record.commissionAmountSnapshot.toString()];
  mock.timers.setTime(finishAt.getTime());
  await process.change(f.employeeId, record.id, record.version, "finish");
  const commission = structuredClone(f.commissions);
  const firstSession = structuredClone(record.sessions[0]);
  mock.timers.setTime(resumeAt.getTime());
  const version = record.version;
  await reopenEmployeeWork(f.employeeId, record.id, version);
  assert.deepEqual([record.id, record.shoeId, record.unit, record.commissionAmountSnapshot.toString()], ids);
  assert.equal(f.records.length, 1); assert.equal(record.completedAt, null);
  assert.equal(record.status, "IN_PROGRESS"); assert.equal(record.version, version + 1);
  assert.deepEqual(record.sessions[0], firstSession);
  assert.equal(record.sessions[1].kind, "RESUME"); assert.equal(record.sessions[1].startedAt.toISOString(), resumeAt.toISOString());
  await assert.rejects(reopenEmployeeWork(f.employeeId, record.id, version), { status: 409 });
  assert.equal(record.sessions.length, 2);
  mock.timers.setTime(new Date("2026-10-03T12:15:00Z").getTime());
  await process.change(f.employeeId, record.id, record.version, "finish");
  assert.equal(record.sessions.reduce((total, s) => total + s.endedAt!.getTime() - s.startedAt.getTime(), 0), 35 * 60_000);
  assert.deepEqual(f.commissions, commission); assert.equal(f.audits[0].data.action, "PRODUCTION_REOPENED");
});

test("reabertura recusa outro dono, dia anterior, retorno, versão antiga, falta de permissão e intervalo aberto", async () => {
  const f = workflowFixture();
  mock.timers.enable({ apis: ["Date"], now: start });
  await startHygieneProduction(f.employeeId, "000123");
  const r = f.records[0]; await changeHygieneProductionState(f.employeeId, r.id, r.version, "finish");
  await assert.rejects(reopenEmployeeWork("other", r.id, r.version), { status: 404 });
  await assert.rejects(reopenEmployeeWork(f.employeeId, r.id, r.version - 1), { status: 409 });
  r.kind = "RETURN";
  await assert.rejects(reopenEmployeeWork(f.employeeId, r.id, r.version), { status: 409 }); r.kind = "STANDARD";
  mock.timers.setTime(new Date("2026-10-04T03:00:00Z").getTime());
  await assert.rejects(reopenEmployeeWork(f.employeeId, r.id, r.version), { status: 409 });
  mock.timers.setTime(resumeAt.getTime());
  const access = mock.method(prisma.employeeProcess, "findFirst", async () => null);
  await assert.rejects(reopenEmployeeWork(f.employeeId, r.id, r.version), { status: 403 }); access.mock.restore();
  await startEmployeeBreak(f.employeeId, "LUNCH");
  await assert.rejects(reopenEmployeeWork(f.employeeId, r.id, r.version), { status: 409 });
  assert.equal(r.status, "COMPLETED"); assert.equal(r.sessions.length, 1); assert.equal(f.commissions.length, 1);
});

test("reabrir prepara troca e finalizar/iniciar outro mantém uma comissão por produção", async () => {
  const f = workflowFixture();
  mock.timers.enable({ apis: ["Date"], now: start });
  await startHygieneProduction(f.employeeId, "000123"); const original = f.records[0];
  await changeHygieneProductionState(f.employeeId, original.id, original.version, "finish");
  await startPaintingProduction(f.employeeId, "000456"); const other = f.records[1];
  await reopenEmployeeWork(f.employeeId, original.id, original.version);
  assert.equal(other.status, "DEFERRED"); assert.ok(other.sessions[0].endedAt);
  await finishAndStartNextHygieneProduction(f.employeeId, original.id, original.version, "00092420260001");
  assert.equal(original.status, "COMPLETED"); assert.equal(f.commissions.length, 1);
  assert.equal(f.records.filter(r => r.status === "IN_PROGRESS").length, 1);
});

test("conflitos do PostgreSQL são apresentados como 409, sem repetição automática da reabertura", async () => {
  workflowFixture();
  for (const code of ["P2034", "P2002"]) {
    const tx = mock.method(prisma, "$transaction", async () => { throw new Prisma.PrismaClientKnownRequestError("conflict", { code, clientVersion: "test" }); });
    await assert.rejects(reopenEmployeeWork("owner", "work", 1), { status: 409 });
    assert.equal(tx.mock.callCount(), 1); tx.mock.restore();
  }
});

test("dia e sessões usam São Paulo, incluindo sessão de ontem atravessando meia-noite", () => {
  const now = new Date("2026-10-04T02:59:59Z");
  assert.equal(productionDay(now).day, "2026-10-03");
  assert.equal(productionDay(new Date("2026-10-04T03:00:00Z")).day, "2026-10-04");
  assert.ok(sessionActiveToday({ startedAt: new Date("2026-10-03T02:00:00Z"), endedAt: new Date("2026-10-03T04:00:00Z") }, now));
  assert.ok(!sessionActiveToday({ startedAt: new Date("2026-10-03T01:00:00Z"), endedAt: new Date("2026-10-03T02:59:59Z") }, now));
});

test("listagem consulta apenas sessões do dono no dia e ordena atividade preservando códigos, processo e unidade", async () => {
  const now = new Date("2026-10-03T19:00:00Z");
  const query = mock.method(prisma.production, "findMany", async () => [
    { id: "old", shoe: { code: "000123" }, processType: { name: "Higienização" }, unit: "PAIR", kind: "STANDARD", status: "COMPLETED", version: 1, sessions: [{ startedAt: new Date("2026-10-02T22:00:00Z"), endedAt: new Date("2026-10-03T04:00:00Z") }] },
    { id: "new", shoe: { code: "00092420260001" }, processType: { name: "Finalização" }, unit: "LEFT_FOOT", kind: "STANDARD", status: "IN_PROGRESS", version: 4, sessions: [{ startedAt: new Date("2026-10-03T18:00:00Z"), endedAt: null }] },
  ]);
  const result = await getEmployeeDayWorks("owner", now);
  assert.deepEqual(query.mock.calls[0].arguments[0]!.where, { employeeId: "owner", sessions: { some: { startedAt: { lte: now }, OR: [{ endedAt: null }, { endedAt: { gte: new Date("2026-10-03T03:00:00Z") } }] } } });
  assert.deepEqual(result.works.map(w => [w.id, w.code, w.processName, w.unit]), [["new", "00092420260001", "Finalização", "LEFT_FOOT"], ["old", "000123", "Higienização", "PAIR"]]);
});
