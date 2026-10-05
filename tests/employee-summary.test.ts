import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { prisma } from "./fake-prisma";
import { getEmployeeMonthlySummary, summaryMonthPeriod } from "../services/employee-summary.service";
import { getManagementDashboard, getManagementExport } from "../services/management.service";
import { buildManagementWorkbook } from "../services/management-workbook.service";
import ExcelJS from "exceljs";

afterEach(() => mock.restoreAll());

test("resumo consulta somente dono/mês, conta produções uma vez e soma ledger sem regras atuais", async () => {
  mock.method(prisma.employee, "findFirst", async () => ({ id: "owner", name: "Funcionário", active: true }));
  const productions = mock.method(prisma.production, "findMany", async () => [
    { processType: { name: "Higienização" }, unit: "PAIR" },
    { processType: { name: "Finalização" }, unit: "PAIR" },
    { processType: { name: "Finalização" }, unit: "LEFT_FOOT" },
    { processType: { name: "Finalização" }, unit: "RIGHT_FOOT" },
    { processType: { name: "Pintura" }, unit: "PAIR" },
  ]);
  const ledger = mock.method(prisma.commissionEntry, "aggregate", async () => ({ _sum: { amount: { toString: () => "8.37" } } }));
  const summary = await getEmployeeMonthlySummary("owner", "2026-09");
  assert.deepEqual([summary.hygienePairs, summary.finalizationPairs, summary.finalizationFeet, summary.paintingPairs, summary.earnedCommissionCents], [1, 1, 2, 1, 837]);
  const period = summaryMonthPeriod("2026-09");
  assert.deepEqual(productions.mock.calls[0].arguments[0]!.where, { employeeId: "owner", kind: "STANDARD", status: "COMPLETED", completedAt: { gte: period.start, lt: period.endExclusive } });
  assert.deepEqual(ledger.mock.calls[0].arguments[0]!.where, { earnedAt: { gte: period.start, lt: period.endExclusive }, production: { employeeId: "owner", kind: "STANDARD", status: { not: "CANCELLED" } } });
  assert.deepEqual(productions.mock.calls[0].arguments[0]!.select, { unit: true, processType: { select: { name: true } } });
});

test("gerente com ledger zero e mês sem lançamentos não recebem comissão calculada por quantidade", async () => {
  mock.method(prisma.employee, "findFirst", async () => ({ id: "manager", name: "Gerente", active: true }));
  mock.method(prisma.production, "findMany", async () => [{ processType: { name: "Higienização" }, unit: "PAIR" }]);
  for (const amount of [null, { toString: () => "0.00" }]) {
    const sum = mock.method(prisma.commissionEntry, "aggregate", async () => ({ _sum: { amount } }));
    const summary = await getEmployeeMonthlySummary("manager", "2026-09");
    assert.equal(summary.hygienePairs, 1); assert.equal(summary.earnedCommissionCents, 0); sum.mock.restore();
  }
});

test("comissão histórica continua no dashboard e XLSX durante reabertura, sem contar como concluída", async () => {
  const employee = { id: "owner", name: "Funcionário", active: true };
  mock.method(prisma.employee, "findMany", async () => [employee]);
  mock.method(prisma.processType, "findMany", async () => []);
  mock.method(prisma.employeeBreak, "findMany", async () => []);
  mock.method(prisma.production, "findMany", async () => [{
    id: "work", employee, shoe: { code: "000123" }, processType: { id: "h", name: "Higienização" },
    kind: "STANDARD", unit: "PAIR", status: "IN_PROGRESS", completedAt: null,
    startedAt: new Date("2026-09-18T12:00:00Z"), sourceProduction: null,
    commission: { amount: { toString: () => "0.37" }, earnedAt: new Date("2026-09-18T13:00:00Z") }, sessions: [],
  }]);
  const dashboard = await getManagementDashboard(summaryMonthPeriod("2026-09"));
  assert.equal(dashboard.totals.earnedCommissionCents, 37); assert.equal(dashboard.totals.completedPairs, 0);
  const data = await getManagementExport(summaryMonthPeriod("2026-09"));
  assert.equal(data.employeeExportRows.reduce((sum, row) => sum + row.earnedCommissionCents, 0), 37);
  const workbook = buildManagementWorkbook(data, { startValue: "2026-09-01", endValue: "2026-09-30" });
  const read = new ExcelJS.Workbook(); await read.xlsx.load(await workbook.xlsx.writeBuffer());
  assert.equal(read.getWorksheet("Resumo Mensal")!.getCell("L2").value, 0.37);
  assert.equal(read.getWorksheet("Funcionário")!.getCell("H2").value, 0.37);
});
