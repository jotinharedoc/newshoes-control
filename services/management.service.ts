

import {
  findManagementBreaks,
  findManagementFilterOptions,
  findManagementProductions,
  type ManagementFilters,
} from "@/repositories/management.repository";
import { calculateManagementMetrics } from "@/services/management-metrics.service";

function isWithinPeriod(
  date: Date | null,
  start: Date,
  endExclusive: Date,
) {
  return (
    date !== null &&
    date.getTime() >= start.getTime() &&
    date.getTime() < endExclusive.getTime()
  );
}

function getOverlapMs(
  startedAt: Date,
  endedAt: Date | null,
  start: Date,
  endExclusive: Date,
  now: Date,
) {
  const from = Math.max(startedAt.getTime(), start.getTime());

  const to = Math.min(
    endedAt?.getTime() ?? now.getTime(),
    endExclusive.getTime(),
    now.getTime(),
  );

  return Math.max(0, to - from);
}

function toCents(amount: { toString(): string }) {
  return Math.round(Number(amount.toString()) * 100);
}

type Summary = {
  completedPairs: number;
  completedSingleFeet: number;
  completedReturns: number;
  productionsWithContinuation: number;
  workedMs: number;
  earnedCommissionCents: number;
};

function emptySummary(): Summary {
  return {
    completedPairs: 0,
    completedSingleFeet: 0,
    completedReturns: 0,
    productionsWithContinuation: 0,
    workedMs: 0,
    earnedCommissionCents: 0,
  };
}

type GroupSummary = Summary & {
  id: string;
  name: string;
};

export async function getManagementDashboard(
  filters: ManagementFilters,
) {
  // Um único instante de referência para todas as sessões abertas.
  const now = new Date();
  const { start, endExclusive } = filters;

  const [productions, breaks, filterOptions] = await Promise.all([
    findManagementProductions(filters),
    findManagementBreaks(filters),
    findManagementFilterOptions(),
  ]);

  const rows = productions.map((production) => {
    const workedMs = production.sessions.reduce(
      (total, session) =>
        total +
        getOverlapMs(
          session.startedAt,
          session.endedAt,
          start,
          endExclusive,
          now,
        ),
      0,
    );

    const completedInPeriod =
      production.status === "COMPLETED" &&
      isWithinPeriod(production.completedAt, start, endExclusive);

     
        const continuationInPeriod = production.sessions.some(
      (session) =>
        session.kind === "CONTINUATION" &&
        isWithinPeriod(session.startedAt, start, endExclusive),
    );


    const commission = production.commission;

    // Usa o lançamento efetivo, não o valor previsto na produção.
    // Retornos e cancelamentos não geram comissão neste relatório.
    const earnedCommissionCents =
      production.kind === "STANDARD" &&
      production.status === "COMPLETED" &&
      commission !== null &&
      isWithinPeriod(commission.earnedAt, start, endExclusive)
        ? toCents(commission.amount)
        : 0;

    return {
      id: production.id,
      code: production.shoe.code,
      employeeId: production.employee.id,
      employeeName: production.employee.name,
      processTypeId: production.processType.id,
      processName: production.processType.name,
      unit: production.unit,
      kind: production.kind,
      status: production.status,
      returnReason: production.returnReason,
      sourceProductionId: production.sourceProductionId,
      originalEmployeeName:
        production.sourceProduction?.employee.name ?? null,
      startedAt: production.startedAt.toISOString(),
      completedAt: production.completedAt?.toISOString() ?? null,
      completedInPeriod,
      continuationInPeriod,
      workedMs,
      earnedCommissionCents,
      commissionEarnedAt: commission?.earnedAt.toISOString() ?? null,
      sessions: production.sessions.map((session) => ({
        id: session.id,
        kind: session.kind,
        startedAt: session.startedAt.toISOString(),
        endedAt: session.endedAt?.toISOString() ?? null,
        endReason: session.endReason,
        workedMsInPeriod: getOverlapMs(
          session.startedAt,
          session.endedAt,
          start,
          endExclusive,
          now,
        ),
      })),
    };
  });

  const totals = emptySummary();
  const employeeGroups = new Map<string, GroupSummary>();
  const processGroups = new Map<string, GroupSummary>();

  function getGroup(
    groups: Map<string, GroupSummary>,
    id: string,
    name: string,
  ) {
    let group = groups.get(id);

    if (!group) {
      group = { id, name, ...emptySummary() };
      groups.set(id, group);
    }

    return group;
  }

  function accumulate(
    summary: Summary,
    row: (typeof rows)[number],
  ) {
    summary.workedMs += row.workedMs;
    summary.earnedCommissionCents += row.earnedCommissionCents;

    if (
      row.continuationInPeriod &&
      row.status !== "CANCELLED"
    ) {
      summary.productionsWithContinuation += 1;
    }

    if (!row.completedInPeriod) return;

    if (row.kind === "RETURN") {
      summary.completedReturns += 1;
      return;
    }

    if (row.unit === "PAIR") {
      summary.completedPairs += 1;
    } else {
      summary.completedSingleFeet += 1;
    }
  }

  for (const row of rows) {
    accumulate(totals, row);

    accumulate(
      getGroup(employeeGroups, row.employeeId, row.employeeName),
      row,
    );

    accumulate(
      getGroup(processGroups, row.processTypeId, row.processName),
      row,
    );
  }

  const breakRows = breaks.map((employeeBreak) => ({
    id: employeeBreak.id,
    employeeId: employeeBreak.employee.id,
    employeeName: employeeBreak.employee.name,
    kind: employeeBreak.kind,
    startedAt: employeeBreak.startedAt.toISOString(),
    endedAt: employeeBreak.endedAt?.toISOString() ?? null,
    durationMs: getOverlapMs(
      employeeBreak.startedAt,
      employeeBreak.endedAt,
      start,
      endExclusive,
      now,
    ),
  }));

  return {
    generatedAt: now.toISOString(),
    metrics: calculateManagementMetrics(productions, breaks, filters, now),
    period: {
      start: start.toISOString(),
      endExclusive: endExclusive.toISOString(),
    },
    totals,
    byEmployee: [...employeeGroups.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR"),
    ),
    byProcess: [...processGroups.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR"),
    ),
    rows,
    breaks: breakRows,
        // Intervalos pertencem ao funcionário, não a um processo.
    totalBreakMs: breakRows.reduce(
      (total, employeeBreak) => total + employeeBreak.durationMs,
      0,
    ),
    totalLunchMs: breakRows.reduce(
      (total, employeeBreak) =>
        total +
        (employeeBreak.kind === "LUNCH"
          ? employeeBreak.durationMs
          : 0),
      0,
    ),
    totalBathroomMs: breakRows.reduce(
      (total, employeeBreak) =>
        total +
        (employeeBreak.kind === "BATHROOM"
          ? employeeBreak.durationMs
          : 0),
      0,
    ),
    filterOptions,
  };
}

export type ManagementDashboardData = Awaited<
  ReturnType<typeof getManagementDashboard>
>;
