import type { ManagementFilters, ManagementProductionRecord } from "@/repositories/management.repository";
import { managementConfig } from "@/config/management";

/** Daily work rows for the familiar employee ledger; no production or commission is created. */
export function buildManagementExportRows(productions: ManagementProductionRecord[], filters: ManagementFilters, now: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: managementConfig.timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const dayOf = (date: Date) => {
    const p = Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
    return `${p.year}-${p.month}-${p.day}`;
  };
  const start = filters.start.getTime();
  const end = Math.min(filters.endExclusive.getTime(), now.getTime());
  type Row = { employeeId: string; productionId: string; day: string; code: string; kind: "Normal" | "Continuação" | "Retorno"; processName: string; startedAt: string | null; endedAt: string | null; workedMs: number; earnedCommissionCents: number };
  const rows: Row[] = [];
  for (const production of productions) {
    const groups: Row[] = [];
    let continuation = false;
    function entry(day: string, resumed: boolean) {
      const kind = production.kind === "RETURN" ? "Retorno" : resumed ? "Continuação" : "Normal";
      let row = groups.find(row => row.day === day && row.kind === kind);
      if (!row) {
        row = { employeeId: production.employee.id, productionId: production.id, day, code: production.shoe.code, kind,
          processName: production.processType.name === "Finalização" && production.unit !== "PAIR" ? "Finalização (1 pé)" : production.processType.name,
          startedAt: null, endedAt: null, workedMs: 0, earnedCommissionCents: 0 };
        groups.push(row);
      }
      return row;
    }
    for (const session of production.sessions) {
      if (session.kind === "CONTINUATION") continuation = true;
      let cursor = Math.max(session.startedAt.getTime(), start);
      const stop = Math.min(session.endedAt?.getTime() ?? now.getTime(), end);
      while (cursor < stop) {
        const day = dayOf(new Date(cursor));
        // Find the next local date boundary without assuming the machine timezone or a fixed UTC offset.
        let low = cursor; let high = cursor + 27 * 3_600_000;
        while (high - low > 1) {
          const middle = Math.floor((low + high) / 2);
          if (dayOf(new Date(middle)) === day) low = middle; else high = middle;
        }
        const boundary = Math.min(high, stop);
        const row = entry(day, continuation);
        row.startedAt ??= new Date(cursor).toISOString();
        row.endedAt = session.endedAt ? new Date(boundary).toISOString() : null;
        row.workedMs += boundary - cursor;
        cursor = boundary;
      }
    }
    const commission = production.kind === "STANDARD" && production.status === "COMPLETED" ? production.commission : null;
    if (commission && commission.earnedAt.getTime() >= start && commission.earnedAt.getTime() < end) {
      const day = dayOf(commission.earnedAt);
      const row = groups.filter(row => row.day === day).at(-1) ?? entry(day, continuation);
      row.earnedCommissionCents = Math.round(Number(commission.amount.toString()) * 100);
    }
    if (!groups.length && production.startedAt.getTime() >= start && production.startedAt.getTime() < end) entry(dayOf(production.startedAt), continuation);
    rows.push(...groups);
  }
  return rows.sort((a, b) => a.day.localeCompare(b.day) || (a.startedAt ?? "").localeCompare(b.startedAt ?? "") || a.productionId.localeCompare(b.productionId));
}
