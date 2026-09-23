import type ExcelJS from "exceljs";
import { addManagementTemplateSheets } from "@/services/management-template-export.service";
import type { ManagementDashboardData } from "@/services/management.service";

const currencyFormat = '"R$" #,##0.00';

/** Adds operational views while keeping every existing audit sheet. No business calculations here. */
export function addManagementMetricSheets(workbook: ExcelJS.Workbook, data: ManagementDashboardData) {
  function sheet(name: string, headers: string[], rows: (string | number | null)[][]) {
    const result = workbook.addWorksheet(name);
    result.addRow(headers);
    result.addRows(rows);
    result.views = [{ state: "frozen", ySplit: 1 }];
    result.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, result.rowCount), column: headers.length } };
    result.columns.forEach(column => { column.width = 24; });
    result.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    result.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF007F8B" } };
    result.getRow(1).alignment = { wrapText: true, vertical: "middle" };
    result.getRow(1).height = 42;
    return result;
  }
  addManagementTemplateSheets(workbook, data);
  const metrics = data.metrics;
  const formatDate = new Intl.DateTimeFormat("pt-BR", { timeZone: metrics.parameters.timeZone, dateStyle: "short", timeStyle: "medium" });
  const date = (value: string | null) => value ? formatDate.format(new Date(value)) : "";
  const headers = ["Data de início", "Código", "Tipo de registro", "Processo", "Unidade", "Início", "Fim", "Tempo no período (segundos)", "Comissão (R$)", "Retorno", "Continuação", "Motivo do retorno", "Funcionário", "ID da produção", "Produção original", "Status"];
  const rowValues = (row: ManagementDashboardData["rows"][number]) => [
    date(row.startedAt).split(",")[0], row.code, row.kind, row.processName, row.unit, date(row.startedAt), date(row.completedAt),
    row.workedMs / 1000, row.earnedCommissionCents / 100, row.kind === "RETURN" ? "Sim" : "Não",
    row.continuationInPeriod ? "Sim" : "Não", row.returnReason, row.employeeName, row.id, row.sourceProductionId, row.status,
  ];
  const general = sheet("Dados Gerais", headers, data.rows.map(rowValues));
  general.getColumn(2).numFmt = "@";
  general.getColumn(9).numFmt = currencyFormat;

  sheet("Metas Diárias", ["Data", "Funcionário", "Produções padrão", "Meta manhã (%)", "Meta tarde (%)", "Turnos com meta atingida", "Jornada (segundos)", "Tempo trabalhado (segundos)", "Banheiro (segundos)", "Almoço (segundos)", "Ociosidade estimada (segundos)"], metrics.daily.map(day => [
    day.day, day.employeeName, day.completedProductions, day.morningGoalPercent, day.afternoonGoalPercent, day.goalsAchieved,
    day.expectedMs / 1000, day.workedMs / 1000, day.bathroomMs / 1000, day.lunchMs / 1000, day.idleMs === null ? null : day.idleMs / 1000,
  ]));
  sheet("Parâmetros", ["Regra", "Valor"], [
    ["Período inicial", date(data.period.start)], ["Período final (exclusivo)", date(data.period.endExclusive)],
    ["Resumo Mensal", "Resume o período escolhido nos filtros, que pode abranger parte de um mês ou vários meses."],
    ["Timezone", metrics.parameters.timeZone],
    ["Média de produção", metrics.parameters.averageRule], ["Tempo médio", metrics.parameters.durationRule],
    ["Metas", metrics.parameters.goalRule], ["Metas por processo/unidade", JSON.stringify(metrics.parameters.targets)],
    ["Jornada em horas (domingo a sábado)", JSON.stringify(metrics.parameters.dailyHours)],
    ["Ociosidade", metrics.parameters.idleRule], ["Ociosidade não disponível", "Célula vazia: sem dia completo elegível ou com filtro de processo. Não equivale a zero."],
    ["Comissões", "Lançamentos históricos de CommissionEntry. Higienização/par 0,50; finalização/par 0,50; finalização/pé 0,25; pintura/par 1,00. Mudanças futuras não recalculam o passado."],
    ["Retornos", "Retrabalho interno; mantém comissão original e nunca gera nova comissão."],
    ["Continuação", "Retomada do mesmo registro após adiamento; banheiro gera RESUME, não CONTINUATION."],
  ]);
}
