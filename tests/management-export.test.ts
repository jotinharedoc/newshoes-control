import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import ExcelJS from "exceljs";
import { prisma } from "./fake-prisma";
import { getManagementDashboard } from "../services/management.service";
import { addManagementMetricSheets } from "../services/management-export.service";
import type { ManagementProductionRecord } from "../repositories/management.repository";

afterEach(() => mock.restoreAll());

test("Excel reutiliza as métricas, preserva zeros, comissão original e abas individuais sem colisões", async () => {
  const rows = [
    { id: "original", employee: { id: "e1", name: "Resumo" }, kind: "STANDARD", status: "COMPLETED", commission: { amount: { toString: () => "0.50" }, earnedAt: new Date("2026-09-18T15:00:00Z") } },
    { id: "return", employee: { id: "e1", name: "Resumo" }, kind: "RETURN", status: "COMPLETED", commission: null },
    { id: "second", employee: { id: "e2", name: "resumo" }, kind: "STANDARD", status: "DEFERRED", commission: null },
  ].map(item => ({
    shoe: { code: "000123" }, processType: { id: "h", name: "Higienização" }, unit: "PAIR",
    startedAt: new Date("2026-09-18T12:00:00Z"), completedAt: new Date("2026-09-18T15:00:00Z"),
    sourceProduction: null, sourceProductionId: null, returnReason: null,
    sessions: [{ id: `${item.id}-session`, kind: "CONTINUATION", startedAt: new Date("2026-09-18T12:00:00Z"), endedAt: new Date("2026-09-18T13:00:00Z"), endReason: "MANUAL_COMPLETION" }],
    ...item,
  })) as ManagementProductionRecord[];
  mock.method(prisma.production, "findMany", async () => rows);
  mock.method(prisma.employeeBreak, "findMany", async () => []);
  mock.method(prisma.employee, "findMany", async () => []);
  mock.method(prisma.processType, "findMany", async () => []);
  const data = await getManagementDashboard({ start: new Date("2026-09-18T03:00:00Z"), endExclusive: new Date("2026-09-19T03:00:00Z") });
  assert.equal(data.totals.completedReturns, 1);
  assert.equal(data.totals.earnedCommissionCents, 50);
  assert.equal(data.totals.productionsWithContinuation, 3);
  assert.equal(data.metrics.totals.completedProductions, 1);
  const workbook = new ExcelJS.Workbook();
  addManagementMetricSheets(workbook, data);
  workbook.addWorksheet("Resumo"); // Existing audit sheet can still be created.
  const binary = await workbook.xlsx.writeBuffer();
  const read = new ExcelJS.Workbook();
  await read.xlsx.load(binary);
  const summary = read.getWorksheet("Resumo Mensal")!;
  const employee = data.metrics.byEmployee.find(item => item.id === "e1")!;
  assert.equal(summary.getCell("B2").value, employee.hygienePairs);
  assert.equal(summary.getCell("G2").value, employee.averageProductionMs / 1000);
  assert.equal(summary.getCell("K2").value, employee.idleMs! / 1000);
  assert.equal(summary.getCell("L2").value, employee.morningGoalPercent);
  assert.equal(summary.getCell("Q2").value, 0.5);
  assert.equal(read.getWorksheet("Dados Gerais")!.getCell("B2").value, "000123");
  assert.equal(read.getWorksheet("Dados Gerais")!.getCell("I3").value, 0);
  const names = read.worksheets.map(sheet => sheet.name.toLowerCase());
  assert.ok(names.includes("resumo (2)"));
  assert.ok(names.includes("resumo (3)"));
  assert.ok(read.getWorksheet("Parâmetros"));
  assert.ok(read.getWorksheet("Metas Diárias"));
});
