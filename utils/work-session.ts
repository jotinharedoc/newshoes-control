const brazilDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function brazilDateKey(date: Date) {
  const parts = brazilDateFormatter.formatToParts(date);

  const getPart = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${getPart("year")}-${getPart("month")}-${getPart("day")}`;
}

export function isNextWorkDay(
  previousSessionEnd: Date,
  resumedAt: Date,
) {
  return (
    resumedAt.getTime() > previousSessionEnd.getTime() &&
    brazilDateKey(resumedAt) > brazilDateKey(previousSessionEnd)
  );
}