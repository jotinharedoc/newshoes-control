import assert from "node:assert/strict";
import { test } from "node:test";
import type { ManagementProductionRecord } from "../repositories/management.repository";
import { buildManagementExportRows } from "../services/management-export-rows.service";

test("linhas diárias preservam RESUME como Normal e lançam a comissão uma única vez na Continuação", () => {
  const row = {
    id: "p", employee: { id: "e", name: "Teste" }, shoe: { code: "000123" }, processType: { name: "Higienização" },
    kind: "STANDARD", unit: "PAIR", status: "COMPLETED", startedAt: new Date("2026-09-18T02:30:00Z"),
    commission: { amount: { toString: () => "0.50" }, earnedAt: new Date("2026-09-18T17:00:00Z") },
    sessions: [
      { kind: "INITIAL", startedAt: new Date("2026-09-18T02:30:00Z"), endedAt: new Date("2026-09-18T03:30:00Z") },
      { kind: "RESUME", startedAt: new Date("2026-09-18T03:45:00Z"), endedAt: new Date("2026-09-18T04:00:00Z") },
      { kind: "CONTINUATION", startedAt: new Date("2026-09-18T16:00:00Z"), endedAt: new Date("2026-09-18T17:00:00Z") },
    ],
  } as ManagementProductionRecord;
  const result = buildManagementExportRows([row], { start: new Date("2026-09-17T03:00:00Z"), endExclusive: new Date("2026-09-19T03:00:00Z") }, new Date("2026-09-22T12:00:00Z"));
  assert.deepEqual(result.map(item => [item.day, item.kind, item.workedMs, item.earnedCommissionCents]), [
    ["2026-09-17", "Normal", 30 * 60_000, 0],
    ["2026-09-18", "Normal", 45 * 60_000, 0],
    ["2026-09-18", "Continuação", 60 * 60_000, 50],
  ]);
  assert.ok(result.every(item => item.code === "000123"));
  const clipped = buildManagementExportRows([row], { start: new Date("2026-09-18T03:00:00Z"), endExclusive: new Date("2026-09-18T16:30:00Z") }, new Date("2026-09-22T12:00:00Z"));
  assert.equal(clipped.reduce((sum, item) => sum + item.workedMs, 0), 75 * 60_000);
  assert.equal(clipped.reduce((sum, item) => sum + item.earnedCommissionCents, 0), 0);
});
