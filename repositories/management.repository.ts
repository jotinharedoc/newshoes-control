import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";

const managementProductionInclude = {
  shoe: {
    select: {
      code: true,
    },
  },
  employee: {
    select: {
      id: true,
      name: true,
    },
  },
  processType: {
    select: {
      id: true,
      name: true,
    },
  },
  sessions: {
    select: {
      id: true,
      kind: true,
      startedAt: true,
      endedAt: true,
      endReason: true,
    },
    orderBy: {
      startedAt: "asc",
    },
  },
  commission: {
    select: {
      amount: true,
      earnedAt: true,
    },
  },
  sourceProduction: {
    select: {
      id: true,
      employee: {
        select: {
          name: true,
        },
      },
    },
  },
} satisfies Prisma.ProductionInclude;

export type ManagementProductionRecord = Prisma.ProductionGetPayload<{
  include: typeof managementProductionInclude;
}>;

export type ManagementFilters = {
  start: Date;
  endExclusive: Date;
  employeeId?: string;
  processTypeId?: string;
};

function validatePeriod(start: Date, endExclusive: Date) {
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(endExclusive.getTime()) ||
    start >= endExclusive
  ) {
    throw new Error("Período inválido para a consulta da gerência.");
  }
}

export async function findManagementProductions(
  filters: ManagementFilters,
): Promise<ManagementProductionRecord[]> {
  const { start, endExclusive, employeeId, processTypeId } = filters;

  validatePeriod(start, endExclusive);

  return prisma.production.findMany({
    where: {
      employeeId,
      processTypeId,
      OR: [
        // Produções iniciadas dentro do período.
        {
          startedAt: {
            gte: start,
            lt: endExclusive,
          },
        },

        // Produções concluídas dentro do período.
        {
          completedAt: {
            gte: start,
            lt: endExclusive,
          },
        },

        // Inclui retomadas e continuações com atividade no período.
        {
          sessions: {
            some: {
              startedAt: {
                lt: endExclusive,
              },
              OR: [
                {
                  endedAt: {
                    gt: start,
                  },
                },
                {
                  endedAt: null,
                },
              ],
            },
          },
        },

        // Inclui comissões lançadas dentro do período.
        {
          commission: {
            is: {
              earnedAt: {
                gte: start,
                lt: endExclusive,
              },
            },
          },
        },
      ],
    },
    include: managementProductionInclude,
    orderBy: [
      {
        startedAt: "desc",
      },
      {
        id: "asc",
      },
    ],
  });
}

export async function findManagementFilterOptions() {
  const [employees, processes] = await Promise.all([
    prisma.employee.findMany({
      select: {
        id: true,
        name: true,
        active: true,
      },
      orderBy: {
        name: "asc",
      },
    }),
    prisma.processType.findMany({
      select: {
        id: true,
        name: true,
        active: true,
      },
      orderBy: {
        name: "asc",
      },
    }),
  ]);

  return {
    employees,
    processes,
  };
}

export async function findManagementBreaks(filters: ManagementFilters) {
  const { start, endExclusive, employeeId } = filters;

  validatePeriod(start, endExclusive);

  return prisma.employeeBreak.findMany({
    where: {
      employeeId,
      startedAt: {
        lt: endExclusive,
      },
      OR: [
        {
          endedAt: {
            gt: start,
          },
        },
        {
          endedAt: null,
        },
      ],
    },
    select: {
      id: true,
      kind: true,
      startedAt: true,
      endedAt: true,
      employee: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      startedAt: "desc",
    },
  });
}