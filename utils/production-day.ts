/** Current operational day in São Paulo, independent of the server timezone. */
export function productionDay(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now).map(p => [p.type, p.value]));
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  const start = new Date(`${day}T00:00:00-03:00`);
  return { day, start, endExclusive: new Date(start.getTime() + 86_400_000) };
}

export function sessionActiveToday(session: { startedAt: Date; endedAt: Date | null }, now: Date) {
  const { start, endExclusive } = productionDay(now);
  return session.startedAt < endExclusive && session.startedAt <= now &&
    (session.endedAt === null || session.endedAt >= start);
}
