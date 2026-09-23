/** Regras operacionais centralizadas; não alteram comissões históricas. */
export const managementConfig = {
  timeZone: "America/Sao_Paulo",
  afternoonStartsAtHour: 13,
  targets: {
    Higienização: { PAIR: 12 },
    Finalização: { PAIR: 5, LEFT_FOOT: 10, RIGHT_FOOT: 10 },
    Pintura: { PAIR: 1 },
  } as Record<string, Partial<Record<string, number>>>,
  dailyHours: [0, 8, 8, 8, 8, 8, 4],
  deductLunchFromIdle: true,
};

export type ManagementConfig = typeof managementConfig;
