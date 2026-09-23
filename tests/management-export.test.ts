import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import ExcelJS from "exceljs";
import { prisma } from "./fake-prisma";
import { getManagementDashboard } from "../services/management.service";
import { buildManagementWorkbook } from "../services/management-workbook.service";
import type { ManagementProductionRecord } from "../repositories/management.repository";
import { employeeHeaders, monthlyHeaders } from "../services/management-template-export.service";

afterEach(() => mock.restoreAll());

// ExcelJS interprets date-formatted numeric cells as Dates when reopening XLSX.
function excelNumber(value: ExcelJS.CellValue) {
  return value instanceof Date ? (value.getTime() - Date.UTC(1899, 11, 30)) / 86_400_000 : value;
}

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
  const workbook = buildManagementWorkbook(data, { startValue: "2026-09-18", endValue: "2026-09-18" });
  const binary = await workbook.xlsx.writeBuffer();
  const read = new ExcelJS.Workbook();
  await read.xlsx.load(binary);
  const summary = read.getWorksheet("Resumo Mensal")!;
  const employee = data.metrics.byEmployee.find(item => item.id === "e1")!;
  const summaryRow = [2,3].map(index => summary.getRow(index)).find(row => row.getCell(1).value === "Resumo")!;
  assert.equal(summaryRow.getCell(2).value, employee.hygienePairs);
  assert.equal(excelNumber(summaryRow.getCell(7).value), employee.averageProductionMs / 86_400_000);
  assert.equal(excelNumber(summaryRow.getCell(8).value), employee.idleMs! / 86_400_000);
  assert.equal(summaryRow.getCell(11).value, employee.goalsAchievedPercent / 100);
  assert.equal(summaryRow.getCell(12).value, 0.5);
  assert.equal(read.getWorksheet("Dados Gerais")!.getCell("B2").value, "000123");
  assert.equal(read.getWorksheet("Dados Gerais")!.getCell("I3").value, 0);
  const names = read.worksheets.map(sheet => sheet.name.toLowerCase());
  assert.ok(names.includes("resumo (2)"));
  assert.ok(names.includes("resumo (3)"));
  assert.ok(read.getWorksheet("Parâmetros"));
  assert.ok(read.getWorksheet("Metas Diárias"));
  const audit = read.getWorksheet("Produções")!;
  assert.match(String(audit.getCell("N2").value), /18\/09\/2026/);
  assert.equal(audit.getCell("N3").value, null);
  assert.equal(audit.getCell("M3").value, 0);
  assert.equal(audit.getCell("M2").value, 0.5);
});

test("modelo agosto: códigos longos/texto, rótulos, durações e totais diários sobrevivem ao XLSX", async () => {
  const employee = { id: "worker", name: "Equipe Teste" };
  const specifications = [
    ["000123", "Higienização", "PAIR", "STANDARD", "INITIAL", "0.50"],
    ["33333333333333", "Finalização", "LEFT_FOOT", "STANDARD", "CONTINUATION", "0.25"],
    ["42", "Pintura", "PAIR", "RETURN", "INITIAL", null],
    ["7", "Finalização", "PAIR", "STANDARD", "INITIAL", "0.50"],
  ];
  const records = specifications.map(([code, process, unit, kind, sessionKind, amount], index) => ({
    id: `p${index}`, employee, shoe: { code }, processType: { id: process, name: process }, unit, kind, status: "COMPLETED",
    startedAt: new Date(`2026-09-18T${12+index}:00:00Z`), completedAt: new Date(`2026-09-18T${12+index}:30:00Z`),
    sourceProduction: null, sourceProductionId: null, returnReason: null,
    sessions: [{ id: `s${index}`, kind: sessionKind, startedAt: new Date(`2026-09-18T${12+index}:00:00Z`), endedAt: new Date(`2026-09-18T${12+index}:30:00Z`), endReason: "MANUAL_COMPLETION" }],
    commission: amount ? { amount: { toString: () => amount }, earnedAt: new Date(`2026-09-18T${12+index}:30:00Z`) } : null,
  })) as ManagementProductionRecord[];
  mock.method(prisma.production, "findMany", async () => records);
  mock.method(prisma.employeeBreak, "findMany", async () => [
    { employee, id: "bath", kind: "BATHROOM", startedAt: new Date("2026-09-18T16:00:00Z"), endedAt: new Date("2026-09-18T16:15:00Z") },
    { employee, id: "lunch", kind: "LUNCH", startedAt: new Date("2026-09-18T17:00:00Z"), endedAt: new Date("2026-09-18T18:00:00Z") },
  ]);
  mock.method(prisma.employee, "findMany", async () => []);
  mock.method(prisma.processType, "findMany", async () => []);
  const data = await getManagementDashboard({ start: new Date("2026-09-18T03:00:00Z"), endExclusive: new Date("2026-09-19T03:00:00Z") });
  const workbook = buildManagementWorkbook(data, { startValue: "2026-09-18", endValue: "2026-09-18" });
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(await workbook.xlsx.writeBuffer());
  assert.deepEqual(reopened.worksheets.slice(0,3).map(sheet => sheet.name), ["Resumo Mensal", "Configuracoes", "Equipe Teste"]);
  const summary = reopened.getWorksheet("Resumo Mensal")!;
  assert.deepEqual((summary.getRow(1).values as unknown[]).slice(1), monthlyHeaders);
  const sheet = reopened.getWorksheet("Equipe Teste")!;
  assert.deepEqual((sheet.getRow(1).values as unknown[]).slice(1), employeeHeaders);
  assert.equal(sheet.getCell("B2").value, "000123");
  assert.equal(sheet.getCell("B3").value, "33333333333333");
  assert.equal(sheet.getCell("B2").type, ExcelJS.ValueType.String);
  assert.equal(sheet.getCell("B3").type, ExcelJS.ValueType.String);
  assert.equal(sheet.getCell("B3").numFmt, "@");
  assert.deepEqual([2,3,4].map(row => sheet.getCell(`C${row}`).value), ["Normal", "Continuação", "Retorno"]);
  assert.equal(sheet.getCell("D3").value, "Finalização (1 pé)");
  assert.equal(excelNumber(sheet.getCell("E2").value), 9 / 24);
  assert.equal(excelNumber(sheet.getCell("G2").value), 0.5 / 24);
  assert.equal(sheet.getCell("G2").numFmt, "[hh]:mm");
  assert.equal(excelNumber(sheet.getCell("M5").value), 0.25 / 24);
  assert.equal(excelNumber(sheet.getCell("N5").value), 1 / 24);
  assert.equal(sheet.getCell("M2").value, null);
  assert.equal(sheet.getCell("I5").value, 1);
  assert.deepEqual(summary.getCell("I2").value, sheet.getCell("M5").value);
  assert.deepEqual(summary.getCell("J2").value, sheet.getCell("N5").value);
  assert.equal(summary.getCell("L2").value, 1.25);
  assert.equal(sheet.getCell("H4").value, 0);
  assert.equal(sheet.getCell("H3").value, 0);
  assert.equal(reopened.getWorksheet("Configuracoes")!.getCell("B1").value, "Processos Paola");
  const audit = reopened.getWorksheet("Produções")!;
  assert.ok(!audit.getCell("N4").value);
  for (const name of ["Dados Gerais", "Produções", "Sessões"]) {
    const target = reopened.getWorksheet(name)!;
    const column = name === "Sessões" ? 3 : 2;
    assert.equal(target.getRow(3).getCell(column).value, "33333333333333");
    assert.equal(target.getRow(3).getCell(column).numFmt, "@");
  }
});

test("Excel atribui comissão à primeira linha Normal e separa os dias com borda preta grossa", async () => {
  const employee = { id: "worker", name: "Funcionário Teste" };
  const records = [{
    id: "original", employee, shoe: { code: "000123" }, processType: { id: "h", name: "Higienização" },
    unit: "PAIR", kind: "STANDARD", status: "COMPLETED",
    startedAt: new Date("2026-09-18T12:00:00Z"), completedAt: new Date("2026-09-19T13:00:00Z"),
    sourceProduction: null, sourceProductionId: null, returnReason: null,
    commission: { amount: { toString: () => "0.50" }, earnedAt: new Date("2026-09-19T13:00:00Z") },
    sessions: [
      { id: "initial", kind: "INITIAL", startedAt: new Date("2026-09-18T12:00:00Z"), endedAt: new Date("2026-09-18T13:00:00Z"), endReason: "MANUAL_PAUSE" },
      { id: "resume", kind: "RESUME", startedAt: new Date("2026-09-19T11:00:00Z"), endedAt: new Date("2026-09-19T11:30:00Z"), endReason: "MANUAL_PAUSE" },
      { id: "continuation", kind: "CONTINUATION", startedAt: new Date("2026-09-19T12:00:00Z"), endedAt: new Date("2026-09-19T13:00:00Z"), endReason: "MANUAL_COMPLETION" },
    ],
  }] as ManagementProductionRecord[];
  mock.method(prisma.production, "findMany", async () => records);
  mock.method(prisma.employeeBreak, "findMany", async () => []);
  mock.method(prisma.employee, "findMany", async () => []);
  mock.method(prisma.processType, "findMany", async () => []);
  const data = await getManagementDashboard({ start: new Date("2026-09-18T03:00:00Z"), endExclusive: new Date("2026-09-20T03:00:00Z") });
  const before = JSON.stringify(data);
  const workbook = buildManagementWorkbook(data, { startValue: "2026-09-18", endValue: "2026-09-19" });
  const read = new ExcelJS.Workbook();
  await read.xlsx.load(await workbook.xlsx.writeBuffer());
  assert.equal(JSON.stringify(data), before);
  const sheet = read.getWorksheet(employee.name)!;
  assert.deepEqual([2,3,4].map(row => sheet.getCell(`C${row}`).value), ["Normal", "Normal", "Continuação"]);
  assert.deepEqual([2,3,4].map(row => sheet.getCell(`H${row}`).value), [0.5, 0, 0]);
  assert.equal(read.getWorksheet("Resumo Mensal")!.getCell("L2").value, 0.5);
  assert.equal(read.getWorksheet("Produções")!.getCell("M2").value, 0.5);
  for (let column = 1; column <= 14; column++) {
    assert.deepEqual(sheet.getRow(3).getCell(column).border.top, { style: "thick", color: { argb: "FF000000" } });
    assert.equal(sheet.getRow(4).getCell(column).border?.top, undefined);
  }
});
