import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { prisma } from "./fake-prisma";
import { getManagementDashboard, getManagementExport } from "../services/management.service";
import { getEmployeeMonthlySummary, currentBrazilMonth, summaryMonthPeriod } from "../services/employee-summary.service";

afterEach(() => mock.restoreAll());
function fixture() {
  const employee = { id: "employee", name: "Resumo", active: false };
  const records = Array.from({ length: 103 }, (_, index) => ({
    id: String(index), employee, shoe: { code: "000123" }, processType: { id: "h", name: "Higienização" },
    kind: "STANDARD", unit: "PAIR", status: "COMPLETED", returnReason: null, sourceProductionId: null, sourceProduction: null,
    startedAt: new Date("2026-09-18T12:00:00Z"), completedAt: new Date("2026-09-18T12:01:00Z"),
    commission: { amount: { toString: () => "0.37" }, earnedAt: new Date("2026-09-18T12:01:00Z") },
    sessions: [{ id: `s${index}`, kind: "INITIAL", startedAt: new Date("2026-09-18T12:00:00Z"), endedAt: new Date("2026-09-18T12:01:00Z"), endReason: "MANUAL_COMPLETION" }],
  }));
  mock.method(prisma.production, "findMany", async () => records);
  mock.method(prisma.employeeBreak, "findMany", async () => []);
  mock.method(prisma.employee, "findMany", async () => [employee]);
  mock.method(prisma.processType, "findMany", async () => []);
  return records;
}
test("tabela tem 50 registros por página; totais e exportação consideram todos", async () => {
  fixture();
  const filters = summaryMonthPeriod("2026-09");
  const first = await getManagementDashboard(filters, 1);
  const second = await getManagementDashboard(filters, 2);
  const last = await getManagementDashboard(filters, 99);
  assert.deepEqual([first.rows.length, second.rows.length, last.rows.length], [50, 50, 3]);
  assert.equal(second.rows[0].id, "50");
  assert.equal(last.pagination.page, 3);
  assert.equal(first.totals.completedPairs, 103);
  assert.deepEqual(first.totals, second.totals);
  assert.deepEqual(first.metrics, second.metrics);
  assert.deepEqual(first.employeeExportRows, []);
  const excel = await getManagementExport(filters);
  assert.equal(excel.rows.length, 103);
  assert.equal(excel.employeeExportRows.length, 103);
});
test("resumo mensal usa ledger histórico e reúne processos, pés, retornos e continuações", async () => {
  const records = fixture();
  records[0].processType = { id: "f", name: "Finalização" };
  records[1].processType = { id: "f", name: "Finalização" }; records[1].unit = "LEFT_FOOT";
  records[2].processType = { id: "p", name: "Pintura" };
  records[3].kind = "RETURN";
  records[4].sessions.push({ ...records[4].sessions[0], id: "continuation", kind: "CONTINUATION" });
  mock.method(prisma.employee, "findFirst", async (args: { where: { id: string } }) => args.where.id === "employee" ? records[0].employee : null);
  mock.method(prisma.production, "findMany", async () => records.filter(r => r.kind === "STANDARD"));
  mock.method(prisma.commissionEntry, "aggregate", async () => ({ _sum: { amount: { toString: () => String(102 * 0.37) } } }));
  const summary = await getEmployeeMonthlySummary("employee", "2026-09");
  assert.deepEqual([summary.hygienePairs, summary.finalizationPairs, summary.finalizationFeet, summary.paintingPairs], [99, 1, 1, 1]);
  assert.equal(summary.earnedCommissionCents, 102 * 37);
  assert.equal(summary.employee.active, false);
  await assert.rejects(getEmployeeMonthlySummary("missing", "2026-09"), { status: 404 });
});
test("mês padrão usa São Paulo e datas mensais validam limites", () => {
  assert.equal(currentBrazilMonth(new Date("2026-10-01T02:00:00Z")), "2026-09");
  assert.equal(summaryMonthPeriod("2026-12").endExclusive.toISOString(), "2027-01-01T03:00:00.000Z");
  assert.equal(summaryMonthPeriod("2028-02").endExclusive.toISOString(), "2028-03-01T03:00:00.000Z");
  for (const month of ["2026-13", "2026-00", "bad"]) assert.throws(() => summaryMonthPeriod(month), { status: 400 });
});
