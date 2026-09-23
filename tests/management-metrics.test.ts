import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateManagementMetrics } from "../services/management-metrics.service";
import { managementConfig } from "../config/management";
import type { ManagementProductionRecord } from "../repositories/management.repository";

const hour = 3_600_000;
const employee = { id: "worker", name: "Pessoa de teste" };
const filters = { start: new Date("2026-09-18T03:00:00Z"), endExclusive: new Date("2026-09-21T03:00:00Z") };
const now = new Date("2026-09-22T12:00:00Z");
function production(overrides: Partial<ManagementProductionRecord> = {}): ManagementProductionRecord {
  return {
    id: "p1", employee, processType: { id: "hygiene", name: "Higienização" },
    kind: "STANDARD", unit: "PAIR", status: "COMPLETED", completedAt: new Date("2026-09-18T15:59:59Z"),
    sessions: [{ id: "s1", kind: "INITIAL", startedAt: new Date("2026-09-18T12:00:00Z"), endedAt: new Date("2026-09-18T13:00:00Z"), endReason: "MANUAL_COMPLETION" }],
    ...overrides,
  } as ManagementProductionRecord;
}

test("metas usam São Paulo: 12:59 pertence à manhã e 13:00 à tarde; pés somam frações", () => {
  const rows = Array.from({ length: 12 }, () => production());
  rows.push(...Array.from({ length: 10 }, () => production({ processType: { id: "finish", name: "Finalização" }, unit: "LEFT_FOOT", completedAt: new Date("2026-09-18T16:00:00Z") })));
  const data = calculateManagementMetrics(rows, [], filters, now);
  assert.ok(Math.abs(data.totals.morningGoalPercent - 100) < 1e-8);
  assert.equal(data.totals.afternoonGoalPercent, 100);
  assert.equal(data.totals.goalsAchieved, 2);
  assert.equal(data.totals.finalizationFeet, 10);
  assert.equal(data.totals.hygienePairs, 12);
  assert.equal(data.totals.averageProductionsPerDay, 22);
});

test("média usa tempo total das produções concluídas e ignora retorno, cancelamento e trabalho aberto", () => {
  const previous = production({ sessions: [
    { id: "s1", kind: "INITIAL", startedAt: new Date("2026-09-17T12:00:00Z"), endedAt: new Date("2026-09-17T13:00:00Z"), endReason: "SHIFT_END" },
    { id: "s2", kind: "CONTINUATION", startedAt: new Date("2026-09-18T12:00:00Z"), endedAt: new Date("2026-09-18T13:00:00Z"), endReason: "MANUAL_COMPLETION" },
  ] });
  const data = calculateManagementMetrics([previous, production(), production({ kind: "RETURN" }), production({ status: "CANCELLED" }), production({ status: "IN_PROGRESS", completedAt: null })], [], filters, now);
  assert.equal(data.totals.completedProductions, 2);
  assert.equal(data.totals.averageProductionMs, 1.5 * hour);
  assert.equal(data.daily[0].workedMs, hour);
});

test("sábado tem quatro horas, domingo zero e ociosidade desconta ambos os intervalos sem duplicar sobreposições", () => {
  const saturday = production({ completedAt: new Date("2026-09-19T14:00:00Z"), sessions: [{ id: "s", kind: "INITIAL", startedAt: new Date("2026-09-19T12:00:00Z"), endedAt: new Date("2026-09-19T13:00:00Z"), endReason: "MANUAL_COMPLETION" }] });
  const data = calculateManagementMetrics([saturday], [
    { employee, kind: "BATHROOM", startedAt: new Date("2026-09-19T12:30:00Z"), endedAt: new Date("2026-09-19T13:30:00Z") },
    { employee, kind: "LUNCH", startedAt: new Date("2026-09-19T13:00:00Z"), endedAt: new Date("2026-09-19T14:00:00Z") },
    { employee, kind: "LUNCH", startedAt: new Date("2026-09-20T13:00:00Z"), endedAt: new Date("2026-09-20T14:00:00Z") },
  ], filters, now);
  assert.equal(data.daily[0].expectedMs, 4 * hour);
  assert.equal(data.daily[0].idleMs, 2 * hour);
  assert.equal(data.daily[1].expectedMs, 0);
  assert.equal(data.daily[1].idleMs, 0);
});

test("dia útil desconta trabalho, banheiro e almoço; não cria faltas em dias sem registro", () => {
  const data = calculateManagementMetrics([production()], [
    { employee, kind: "BATHROOM", startedAt: new Date("2026-09-18T13:00:00Z"), endedAt: new Date("2026-09-18T13:30:00Z") },
    { employee, kind: "LUNCH", startedAt: new Date("2026-09-18T16:00:00Z"), endedAt: new Date("2026-09-18T17:00:00Z") },
  ], filters, now);
  assert.equal(data.totals.idleMs, 5.5 * hour);
  assert.equal(data.totals.idleDays, 1);
  assert.equal(data.daily.length, 1);
});

test("sessões cruzando meia-noite são divididas pelo dia local e recortadas no período", () => {
  const row = production({ status: "IN_PROGRESS", completedAt: null, sessions: [{ id: "s", kind: "INITIAL", startedAt: new Date("2026-09-18T02:30:00Z"), endedAt: new Date("2026-09-19T03:30:00Z"), endReason: "PAUSE" }] });
  const data = calculateManagementMetrics([row], [], filters, now);
  assert.deepEqual(data.daily.map(d => d.day), ["2026-09-18", "2026-09-19"]);
  assert.equal(data.daily[0].workedMs, 24 * hour);
  assert.equal(data.daily[1].workedMs, 0.5 * hour);
  assert.equal(data.daily[0].idleMs, 0);
});

test("dia parcial, futuro e filtro de processo não inventam ociosidade", () => {
  const ongoing = calculateManagementMetrics([production()], [], filters, new Date("2026-09-18T17:00:00Z"));
  assert.equal(ongoing.totals.idleMs, null);
  const process = calculateManagementMetrics([production()], [], { ...filters, processTypeId: "hygiene" }, now);
  assert.equal(process.totals.idleMs, null);
  const future = calculateManagementMetrics([production()], [], filters, new Date("2026-09-17T17:00:00Z"));
  assert.equal(future.daily.length, 0);
});

test("configuração de metas é central, agregados por funcionário permanecem separados", () => {
  const data = calculateManagementMetrics([production(), production({ employee: { id: "other", name: "Outra pessoa" }, processType: { id: "paint", name: "Pintura" } })], [], filters, now, { ...managementConfig, targets: { Higienização: { PAIR: 1 }, Pintura: { PAIR: 2 } } });
  assert.equal(data.byEmployee.find(e => e.id === "worker")?.morningGoalPercent, 100);
  assert.equal(data.byEmployee.find(e => e.id === "other")?.morningGoalPercent, 50);
  assert.equal(data.totals.morningGoalPercent, 75);
  assert.equal(data.totals.averageProductionsPerDay, 2);
});
