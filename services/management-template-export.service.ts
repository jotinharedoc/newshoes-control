import type ExcelJS from "exceljs";
import type { ManagementDashboardData } from "@/services/management.service";

export const monthlyHeaders = ["Funcionário", "Qtd Hig.", "Qtd Fin.", "Qtd Fin (1 pé).", "Qtd Pin.", "Média Pares/Dia", "Tempo Médio Trab.", "Total Ocioso Mês", "Total Banheiro", "Total Almoço", "Metas Batidas (%)", "TOTAL A PAGAR"];
export const employeeHeaders = ["Data", "Código do Tênis", "Tipo de Registro", "Processo", "Início", "Fim", "Tempo Gasto", "Valor a Receber", "Aux_Dia", "Tempo Ocioso Dia", "Meta Manhã (%)", "Meta Tarde (%)", "Pausa Banheiro", "Pausa Almoço"];
const dayMs = 86_400_000;
const currency = '"R$ "#,##0.00';
const duration = (ms: number | null) => ms === null ? null : ms / dayMs;

/** Presentation of agosto.xlsx. Metrics and daily ledger entries are supplied by the backend. */
export function addManagementTemplateSheets(workbook: ExcelJS.Workbook, data: ManagementDashboardData) {
  function table(name: string, headers: string[], widths: number[]) {
    const sheet = workbook.addWorksheet(name);
    sheet.views = [{ state: "normal", showGridLines: true, zoomScale: 100 }];
    sheet.columns = widths.map(width => ({ width, style: { font: { name: "Calibri", size: 11 } } }));
    sheet.addRow(headers);
    sheet.getRow(1).height = 30;
    sheet.getRow(1).eachCell(cell => {
      cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2F5597" } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    });
    return sheet;
  }
  const summary = table("Resumo Mensal", monthlyHeaders, [16,16,16,16,16,16,18.14,16,16,16,16,16]);
  const employees = new Map([...data.byEmployee, ...data.metrics.byEmployee].map(employee => [employee.id, employee.name]));
  summary.getColumn(1).width = Math.max(16, Math.min(32, ...[...employees.values()].map(name => name.length + 2)));
  for (const [id, name] of employees) {
    const metric = data.metrics.byEmployee.find(item => item.id === id)!;
    const group = data.byEmployee.find(item => item.id === id);
    const row = summary.addRow([name, metric.hygienePairs, metric.finalizationPairs, metric.finalizationFeet, metric.paintingPairs,
      metric.averageProductionsPerDay, duration(metric.averageProductionMs), duration(metric.idleMs), duration(metric.bathroomMs), duration(metric.lunchMs),
      metric.goalsAchievedPercent / 100, (group?.earnedCommissionCents ?? 0) / 100]);
    row.alignment = { horizontal: "center", vertical: "middle" };
    row.getCell(1).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    row.getCell(8).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCE4D6" } };
    row.getCell(11).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7E6E6" } };
  }
  summary.getColumn(6).numFmt = "0.0";
  summary.getColumn(7).numFmt = "[hh]:mm:ss";
  for (const column of [8,9,10]) summary.getColumn(column).numFmt = "[hh]:mm";
  summary.getColumn(11).numFmt = "0%";
  summary.getColumn(12).numFmt = currency;

  const config = workbook.addWorksheet("Configuracoes");
  config.columns = [{ width: 24 }, { width: 25 }, { width: 18 }];
  config.addRows([
    ["Processos Comuns", "Processos Paola", "Status"],
    ["Higienização", "Finalização", "Normal"],
    ["Finalização", "Finalização (1 pé)", "Continuação"],
    ["Finalização (1 pé)", "Pintura", "Retorno"],
  ]);
  config.eachRow(row => { row.font = { name: "Calibri", size: 11 }; });

  const names = new Set(["Resumo Mensal", "Configuracoes", "Dados Gerais", "Metas Diárias", "Parâmetros", "Informações", "Resumo", "Funcionários", "Processos", "Produções", "Sessões", "Intervalos"].map(name => name.toLocaleLowerCase("pt-BR")));
  const clock = new Intl.DateTimeFormat("en-GB", { timeZone: data.metrics.parameters.timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  function time(value: string | null) {
    if (!value) return null;
    const p = Object.fromEntries(clock.formatToParts(new Date(value)).map(part => [part.type, part.value]));
    return (Number(p.hour) * 3600 + Number(p.minute) * 60 + Number(p.second)) / 86400;
  }
  for (const [id, name] of employees) {
    const base = name.replace(/[\\/*?:\[\]]/g, " ").trim().replace(/^'+|'+$/g, "") || "Funcionário";
    let title = base.slice(0, 31).replace(/'+$/g, "");
    let suffix = 2;
    while (names.has(title.toLocaleLowerCase("pt-BR"))) {
      const tail = ` (${suffix++})`;
      title = `${base.slice(0, 31 - tail.length)}${tail}`;
    }
    names.add(title.toLocaleLowerCase("pt-BR"));
    const sheet = table(title, employeeHeaders, [8,20,15,22,15,15,15,15,15,15,15,15,15,15]);
    const entries = data.employeeExportRows.filter(row => row.employeeId === id);
    // Only the first Normal row receives the recorded commission. Continuations
    // outside the initial work period remain zero; the monthly total is unchanged.
    const commissions = new Map<string, number>();
    for (const entry of entries) commissions.set(entry.productionId, (commissions.get(entry.productionId) ?? 0) + entry.earnedCommissionCents);
    const displayedCommissions = new Set<string>();
    const daily = data.metrics.daily.filter(day => day.employeeId === id);
    const days = [...new Set([...entries.map(row => row.day), ...daily.map(row => row.day)])].sort();
    for (const day of days) {
      const metric = daily.find(item => item.day === day);
      const dayRows = entries.filter(row => row.day === day);
      // A day with only breaks still needs one dated row, without inventing a production.
      for (const [index, entry] of (dayRows.length ? dayRows : [null]).entries()) {
        const last = index === Math.max(0, dayRows.length - 1);
        const commission = entry?.kind === "Normal" && !displayedCommissions.has(entry.productionId) ? commissions.get(entry.productionId) ?? 0 : 0;
        if (entry?.kind === "Normal") displayedCommissions.add(entry.productionId);
        const row = sheet.addRow([new Date(`${day}T00:00:00Z`), entry?.code ?? null, entry?.kind ?? null, entry?.processName ?? null,
          time(entry?.startedAt ?? null), time(entry?.endedAt ?? null), entry ? duration(entry.workedMs) : null,
          entry ? commission / 100 : null, last ? 1 : 0,
          last ? duration(metric?.idleMs ?? null) : null,
          last && metric && metric.goalPeriods > 0 ? metric.morningGoalPercent / 100 : null,
          last && metric && metric.goalPeriods > 1 ? metric.afternoonGoalPercent / 100 : null,
          last ? duration(metric?.bathroomMs ?? 0) : null, last ? duration(metric?.lunchMs ?? 0) : null]);
        if (index === 0 && day !== days[0]) {
          for (let column = 1; column <= employeeHeaders.length; column++) {
            row.getCell(column).border = { top: { style: "thick", color: { argb: "FF000000" } } };
          }
        }
      }
    }
    sheet.getColumn(1).numFmt = "dd/mm";
    sheet.getColumn(2).numFmt = "@";
    for (const column of [5,6]) sheet.getColumn(column).numFmt = "hh:mm";
    for (const column of [7,10,13,14]) sheet.getColumn(column).numFmt = "[hh]:mm";
    sheet.getColumn(8).numFmt = currency;
    for (const column of [11,12]) sheet.getColumn(column).numFmt = "0%";
    if (sheet.rowCount > 1) {
      for (const [kind, color, priority] of [["Retorno", "FFFFFFCC", 1], ["Continuação", "FFDDEBF7", 2]] as const) {
        sheet.addConditionalFormatting({ ref: `A2:H${sheet.rowCount}`, rules: [{ type: "expression", priority, formulae: [`$C2="${kind}"`], style: { fill: { type: "pattern", pattern: "solid", fgColor: { argb: color } } } }] });
      }
      sheet.addConditionalFormatting({ ref: `K2:L${sheet.rowCount}`, rules: [{ type: "expression", priority: 3, formulae: ["AND(ISNUMBER(K2),K2>=1)"], style: { fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2EFDA" } } } }] });
    }
  }
}
