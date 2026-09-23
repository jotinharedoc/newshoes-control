import { managementConfig, type ManagementConfig } from "@/config/management";
import type { ManagementProductionRecord, ManagementFilters } from "@/repositories/management.repository";

type BreakRecord = {
  employee: { id: string; name: string };
  kind: string;
  startedAt: Date;
  endedAt: Date | null;
};
type Span = [number, number];

function unionMs(spans: Span[]) {
  let end = -Infinity;
  let total = 0;
  for (const [from, to] of spans.sort((a, b) => a[0] - b[0])) {
    total += Math.max(0, to - Math.max(from, end));
    end = Math.max(end, to);
  }
  return total;
}

function emptyCounts() {
  return { hygienePairs: 0, finalizationPairs: 0, finalizationFeet: 0, paintingPairs: 0, completedProductions: 0 };
}

/** Pure calculation shared by the dashboard and export. All timestamps come from persistence. */
export function calculateManagementMetrics(
  productions: ManagementProductionRecord[],
  breaks: BreakRecord[],
  filters: ManagementFilters,
  now: Date,
  config: ManagementConfig = managementConfig,
) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  function local(date: Date) {
    const parts = Object.fromEntries(formatter.formatToParts(date).map(p => [p.type, p.value]));
    return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), parts };
  }
  function midnight(day: string) {
    const desired = Date.parse(`${day}T00:00:00Z`);
    let stamp = desired;
    for (let i = 0; i < 3; i++) {
      const { parts: p } = local(new Date(stamp));
      const represented = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
      stamp += desired - represented;
    }
    return stamp;
  }
  function nextDay(day: string) {
    return new Date(Date.parse(`${day}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  }
  const start = filters.start.getTime();
  const end = Math.min(filters.endExclusive.getTime(), now.getTime());
  const days = new Map<string, ReturnType<typeof newDay>>();
  function newDay(employee: { id: string; name: string }, day: string) {
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
    return {
      employeeId: employee.id, employeeName: employee.name, day, weekday,
      ...emptyCounts(), morningGoalPercent: 0, afternoonGoalPercent: 0,
      work: [] as Span[], bathroom: [] as Span[], lunch: [] as Span[],
    };
  }
  function getDay(employee: { id: string; name: string }, day: string) {
    const key = `${employee.id}:${day}`;
    let entry = days.get(key);
    if (!entry) { entry = newDay(employee, day); days.set(key, entry); }
    return entry;
  }
  function distribute(employee: { id: string; name: string }, from: Date, to: Date | null, kind: "work" | "bathroom" | "lunch") {
    let cursor = Math.max(from.getTime(), start);
    const stop = Math.min(to?.getTime() ?? now.getTime(), end);
    while (cursor < stop) {
      const day = local(new Date(cursor)).day;
      const boundary = Math.min(midnight(nextDay(day)), stop);
      if (boundary <= cursor) throw new Error("Limite diário inválido no relatório.");
      getDay(employee, day)[kind].push([cursor, boundary]);
      cursor = boundary;
    }
  }
  const completedDurations = new Map<string, number[]>();
  for (const production of productions) {
    for (const session of production.sessions) distribute(production.employee, session.startedAt, session.endedAt, "work");
    const completedAt = production.completedAt;
    if (production.kind !== "STANDARD" || production.status !== "COMPLETED" || !completedAt || completedAt.getTime() < start || completedAt.getTime() >= end) continue;
    const { day, hour } = local(completedAt);
    const entry = getDay(production.employee, day);
    entry.completedProductions++;
    if (production.processType.name === "Higienização" && production.unit === "PAIR") entry.hygienePairs++;
    if (production.processType.name === "Finalização") {
      if (production.unit === "PAIR") entry.finalizationPairs++; else entry.finalizationFeet++;
    }
    if (production.processType.name === "Pintura" && production.unit === "PAIR") entry.paintingPairs++;
    const target = config.targets[production.processType.name]?.[production.unit];
    if (target && target > 0) {
      const key = hour < config.afternoonStartsAtHour ? "morningGoalPercent" : "afternoonGoalPercent";
      entry[key] += 100 / target;
    }
    const duration = unionMs(production.sessions.map(s => [s.startedAt.getTime(), Math.min(s.endedAt?.getTime() ?? completedAt.getTime(), completedAt.getTime())] as Span));
    const values = completedDurations.get(production.employee.id) ?? [];
    values.push(duration);
    completedDurations.set(production.employee.id, values);
  }
  for (const item of breaks) distribute(item.employee, item.startedAt, item.endedAt, item.kind === "BATHROOM" ? "bathroom" : "lunch");

  const daily = [...days.values()].map(({ work, bathroom, lunch, ...day }) => {
    const expectedMs = (config.dailyHours[day.weekday] ?? 0) * 3_600_000;
    const completeDay = start <= midnight(day.day) && end >= midnight(nextDay(day.day));
    // A process filter cannot measure employee idle time: other processes are omitted.
    const idleMs = !filters.processTypeId && completeDay && expectedMs > 0
      ? Math.max(0, expectedMs - unionMs([...work, ...bathroom, ...(config.deductLunchFromIdle ? lunch : [])]))
      : null;
    return { ...day, expectedMs, workedMs: unionMs(work), bathroomMs: unionMs(bathroom), lunchMs: unionMs(lunch), idleMs,
      goalPeriods: day.weekday === 0 ? 0 : day.weekday === 6 ? 1 : 2,
      goalsAchieved: day.weekday === 0 ? 0 : Number(day.morningGoalPercent >= 100 - 1e-8) + (day.weekday === 6 ? 0 : Number(day.afternoonGoalPercent >= 100 - 1e-8)),
    };
  }).sort((a, b) => a.day.localeCompare(b.day) || a.employeeName.localeCompare(b.employeeName, "pt-BR"));
  function summarize(selected: typeof daily) {
    const ids = new Set(selected.map(d => d.employeeId));
    const durations = [...ids].flatMap(id => completedDurations.get(id) ?? []);
    const counts = emptyCounts();
    for (const day of selected) for (const key of Object.keys(counts) as (keyof typeof counts)[]) counts[key] += day[key];
    const activeDays = new Set(selected.map(d => d.day)).size;
    const eligible = selected.filter(d => d.idleMs !== null && d.expectedMs > 0);
    const goalPeriods = selected.reduce((sum, day) => sum + day.goalPeriods, 0);
    const goalsAchieved = selected.reduce((sum, day) => sum + day.goalsAchieved, 0);
    return {
      ...counts, activeDays,
      averageProductionsPerDay: activeDays ? counts.completedProductions / activeDays : 0,
      averageProductionMs: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
      bathroomMs: selected.reduce((sum, d) => sum + d.bathroomMs, 0),
      lunchMs: selected.reduce((sum, d) => sum + d.lunchMs, 0),
      idleMs: eligible.length ? eligible.reduce((sum, d) => sum + (d.idleMs ?? 0), 0) : null,
      idleDays: eligible.length,
      morningGoalPercent: selected.length ? selected.reduce((sum, d) => sum + d.morningGoalPercent, 0) / selected.length : 0,
      afternoonGoalPercent: selected.length ? selected.reduce((sum, d) => sum + d.afternoonGoalPercent, 0) / selected.length : 0,
      goalsAchieved,
      goalPeriods,
      goalsAchievedPercent: goalPeriods ? goalsAchieved / goalPeriods * 100 : 0,
    };
  }
  const employees = new Map(productions.map(p => [p.employee.id, p.employee.name]));
  for (const day of daily) employees.set(day.employeeId, day.employeeName);
  return {
    totals: summarize(daily),
    byEmployee: [...employees].map(([id, name]) => ({ id, name, ...summarize(daily.filter(d => d.employeeId === id)) })),
    daily,
    parameters: {
      ...config,
      averageRule: "Produções padrão concluídas / dias com trabalho, conclusão ou intervalo registrado. Retornos não entram na quantidade.",
      durationRule: "Média do tempo total das sessões de produções padrão concluídas no período, incluindo sessões de dias anteriores.",
      goalRule: "Contribuições por produção padrão somadas no turno da conclusão, no horário de São Paulo. Metas Batidas é a proporção dos turnos com pelo menos 100%: dois turnos por dia útil com atividade, somente manhã no sábado e nenhum no domingo.",
      idleRule: `Estimativa apenas em dias completos com atividade registrada: jornada menos trabalho, banheiro${config.deductLunchFromIdle ? " e almoço" : ""}, mínimo zero. Sem dados de presença, dias sem registro não contam. Indisponível com filtro de processo ou dia ainda em curso. Intervalos sobrepostos descontam uma única vez.`,
    },
  };
}
