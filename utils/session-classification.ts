type SessionLike = {
  kind: string;
  endReason: string | null;
  startedAt: Date | string;
};

type LunchLike = {
  pausedProductionId: string | null;
  startedAt: Date | string;
};

export function classifySession(
  sessions: readonly SessionLike[],
  index: number,
  productionId: string,
  lunches: readonly LunchLike[] = [],
): "INITIAL" | "RESUME" | "CONTINUATION" {
  if (index === 0) return "INITIAL";

  const current = sessions[index];
  const previous = sessions[index - 1];

  // Também cobre almoço iniciado quando o tênis já estava pausado.
  const lunchBetweenSessions = lunches.some((lunch) => {
    const lunchTime = new Date(lunch.startedAt).getTime();

    return (
      lunch.pausedProductionId === productionId &&
      lunchTime >= new Date(previous.startedAt).getTime() &&
      lunchTime <= new Date(current.startedAt).getTime()
    );
  });

  if (lunchBetweenSessions) return "CONTINUATION";

  if (
    previous.endReason === "LUNCH" ||
    previous.endReason === "DEFERRED" ||
    previous.endReason === "SHIFT_END"
  ) {
    return "CONTINUATION";
  }

  // Um trabalho pode ter sido pausado e depois deixado para depois.
  // Nesse caso, precisamos manter a classificação gravada.
  if (previous.endReason === "PAUSE") {
    return current.kind === "CONTINUATION"
      ? "CONTINUATION"
      : "RESUME";
  }

  return current.kind === "CONTINUATION"
    ? "CONTINUATION"
    : "RESUME";
}