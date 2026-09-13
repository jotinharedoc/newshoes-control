import ExcelJS from "exceljs";

import { requirePageAccess } from "@/lib/auth-page";
import {
  getManagementDashboard,
  type ManagementDashboardData,
} from "@/services/management.service";
import { MANAGEMENT_PERMISSION } from "@/utils/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dayMs = 24 * 60 * 60 * 1000;
const currencyFormat = '"R$" #,##0.00';

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "medium",
});

const labels: Record<string, string> = {
  PAIR: "Par completo",
  LEFT_FOOT: "Pé esquerdo",
  RIGHT_FOOT: "Pé direito",
  STANDARD: "Normal",
  RETURN: "Retorno",
  IN_PROGRESS: "Em andamento",
  PAUSED: "Pausado",
  DEFERRED: "Adiado",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
  INITIAL: "Início",
  RESUME: "Retomada",
  CONTINUATION: "Continuação",
  PAUSE: "Pausa",
  LUNCH: "Almoço",
  SHIFT_END: "Fim do turno",
  NEXT_QR_SCAN: "Leitura do próximo código",
  MANUAL_COMPLETION: "Conclusão manual",
};

function label(value: string | null) {
  return value ? labels[value] ?? value : "";
}

function date(value: string | null) {
  return value ? dateFormatter.format(new Date(value)) : "";
}

function parseDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const parsed = new Date(`${value}T00:00:00Z`);

  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    return null;
  }

  return new Date(`${value}T00:00:00-03:00`);
}

type Cell = string | number | boolean | null;

function addSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  headers: string[],
  rows: Cell[][],
) {
  const sheet = workbook.addWorksheet(name);

  sheet.addRow(headers);
  sheet.addRows(rows);
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, sheet.rowCount), column: headers.length },
  };

  const header = sheet.getRow(1);
  header.height = 32;
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF007F8B" },
  };

  sheet.columns.forEach((column, index) => {
    column.width = Math.min(42, Math.max(20, headers[index].length + 3));
  });

  sheet.eachRow((row) => {
    row.alignment = { vertical: "top", wrapText: true };
  });

  return sheet;
}

function addSummary(
  workbook: ExcelJS.Workbook,
  name: string,
  groups: Array<
    ManagementDashboardData["totals"] & { name: string }
  >,
) {
  const sheet = addSheet(
    workbook,
    name,
    [
      "Nome",
      "Pares concluídos",
      "Pés avulsos concluídos",
      "Retornos concluídos",
      "Produções com continuação",
      "Tempo no período (segundos)",
      "Comissão no período (R$)",
    ],
    groups.map((group) => [
      group.name,
      group.completedPairs,
      group.completedSingleFeet,
      group.completedReturns,
      group.productionsWithContinuation,
      group.workedMs / 1000,
      group.earnedCommissionCents / 100,
    ]),
  );

  sheet.getColumn(6).numFmt = "0.000";
  sheet.getColumn(7).numFmt = currencyFormat;
}

export async function GET(request: Request) {
  // A mesma proteção usada na página da gerência.
  await requirePageAccess(MANAGEMENT_PERMISSION);

  const params = new URL(request.url).searchParams;
  const startValue = params.get("start");
  const endValue = params.get("end");

  const start = parseDate(startValue);
  const end = parseDate(endValue);

  if (
    !start ||
    !end ||
    start > end ||
    end.getTime() - start.getTime() >= 366 * dayMs
  ) {
    return Response.json(
      { error: "Informe um período válido de até 366 dias." },
      { status: 400 },
    );
  }

  const employeeId = params.get("employeeId") || undefined;
  const processTypeId = params.get("processTypeId") || undefined;

  const data = await getManagementDashboard({
    start,
    endExclusive: new Date(end.getTime() + dayMs),
    employeeId,
    processTypeId,
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "NEWSHOES CONTROL";
  workbook.created = new Date(data.generatedAt);

  const employeeName = employeeId
    ? data.filterOptions.employees.find((item) => item.id === employeeId)
        ?.name ?? employeeId
    : "Todos";

  const processName = processTypeId
    ? data.filterOptions.processes.find((item) => item.id === processTypeId)
        ?.name ?? processTypeId
    : "Todos";

  addSheet(
    workbook,
    "Informações",
    ["Campo", "Valor"],
    [
      ["Sistema", "NEWSHOES CONTROL"],
      ["Data inicial", startValue],
      ["Data final", endValue],
      ["Funcionário", employeeName],
      ["Processo", processName],
      ["Gerado em", date(data.generatedAt)],
      ["Fuso horário", "America/Sao_Paulo — Brasília"],
      ["Quantidades", "Serviços concluídos; um tênis pode contar em processos diferentes."],
      ["Comissões", "Lançamentos no período, excluindo retornos e cancelamentos."],
      ["Tempos", "Segundos com milissegundos, limitados ao período selecionado."],
      ["Status", "Estado atual da produção no momento da consulta."],
            [
        "Continuação",
        "Trabalho retomado após almoço ou deixado para depois. Pausa banheiro não conta continuação.",
      ],
      ["Sessões", "Histórico das produções selecionadas; tempo contabilizado só dentro do período."],
      ["Almoço", "Segue o funcionário e o período, independentemente do filtro de processo."],
      ["Total de almoço (segundos)", data.totalBreakMs / 1000],
    ],
  );

  addSummary(workbook, "Resumo", [
    { name: "Total", ...data.totals },
  ]);
  addSummary(workbook, "Funcionários", data.byEmployee);
  addSummary(workbook, "Processos", data.byProcess);

  const productions = addSheet(
    workbook,
    "Produções",
    [
      "ID",
      "Código",
      "Funcionário",
      "Processo",
      "Unidade",
      "Tipo",
      "Status atual",
      "Início",
      "Conclusão",
      "Concluído no período",
      "Continuação no período",
      "Tempo no período (segundos)",
      "Comissão no período (R$)",
      "Data do lançamento",
      "Motivo do retorno",
      "Produção original",
      "Responsável original",
    ],
    data.rows.map((row) => [
      row.id,
      row.code,
      row.employeeName,
      row.processName,
      label(row.unit),
      label(row.kind),
      label(row.status),
      date(row.startedAt),
      date(row.completedAt),
      row.completedInPeriod ? "Sim" : "Não",
      row.continuationInPeriod ? "Sim" : "Não",
      row.workedMs / 1000,
      row.earnedCommissionCents / 100,
      date(row.commissionEarnedAt),
      row.returnReason,
      row.sourceProductionId,
      row.originalEmployeeName,
    ]),
  );

  // Mantém códigos como texto, incluindo eventuais zeros iniciais.
  productions.getColumn(2).numFmt = "@";
  productions.getColumn(12).numFmt = "0.000";
  productions.getColumn(13).numFmt = currencyFormat;

  const sessions = addSheet(
    workbook,
    "Sessões",
    [
      "ID da sessão",
      "ID da produção",
      "Código",
      "Funcionário",
      "Processo",
      "Tipo gravado",
      "Classificação atual",
      "Início",
      "Fim",
      "Motivo do encerramento",
      "Tempo no período (segundos)",
    ],
    data.rows.flatMap((row) =>
      row.sessions.map((session, index) => {
             // Preserva o tipo histórico em uma coluna e aplica
        // a regra atual na coluna de classificação.
                const interpretedKind =
          index === 0 ? "INITIAL" : session.kind;

        return [
          session.id,
          row.id,
          row.code,
          row.employeeName,
          row.processName,
          label(session.kind),
          label(interpretedKind),
          date(session.startedAt),
          date(session.endedAt),
          label(session.endReason),
          session.workedMsInPeriod / 1000,
        ];
      }),
    ),
  );

  sessions.getColumn(3).numFmt = "@";
  sessions.getColumn(11).numFmt = "0.000";

  const breaks = addSheet(
    workbook,
    "Intervalos",
    [
      "ID",
      "Funcionário",
      "Tipo",
      "Início",
      "Fim",
      "Tempo no período (segundos)",
    ],
    data.breaks.map((item) => [
      item.id,
      item.employeeName,
      label(item.kind),
      date(item.startedAt),
      date(item.endedAt),
      item.durationMs / 1000,
    ]),
  );

  breaks.getColumn(6).numFmt = "0.000";

  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        `attachment; filename="newshoes-${startValue}-${endValue}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}