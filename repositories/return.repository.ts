import { prisma } from "@/lib/prisma";

import {
  Prisma,
  ProductionKind,
  ProductionStatus,
  SessionKind,
} from "@/lib/generated/prisma/client";

type DatabaseClient = Prisma.TransactionClient | typeof prisma;

const returnInclude = {
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
  sourceProduction: {
    select: {
      id: true,
      completedAt: true,
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
      startedAt: "asc" as const,
    },
  },
} satisfies Prisma.ProductionInclude;

export type ReturnRecord = Prisma.ProductionGetPayload<{
  include: typeof returnInclude;
}>;

// Localiza serviços normais já concluídos para a gerência
// escolher exatamente qual serviço foi reprovado.
export function findReturnCandidates(
  shoeCode: string,
  database: DatabaseClient = prisma,
) {
  return database.production.findMany({
    where: {
      shoe: {
        code: shoeCode,
      },
      kind: ProductionKind.STANDARD,
      status: ProductionStatus.COMPLETED,
    },
    select: {
      id: true,
      unit: true,
      completedAt: true,
      shoe: {
        select: {
          code: true,
        },
      },
      employee: {
        select: {
          id: true,
          name: true,
          active: true,
        },
      },
      processType: {
        select: {
          id: true,
          name: true,
          active: true,
        },
      },
    },
    orderBy: [
      {
        completedAt: "desc",
      },
      {
        id: "asc",
      },
    ],
  });
}

export function findReturnSource(
  productionId: string,
  database: DatabaseClient = prisma,
) {
  return database.production.findFirst({
    where: {
      id: productionId,
      kind: ProductionKind.STANDARD,
      status: ProductionStatus.COMPLETED,
    },
    select: {
      id: true,
      shoeId: true,
      employeeId: true,
      processTypeId: true,
      unit: true,
    },
  });
}

export function findPendingReturn(
  sourceProductionId: string,
  database: DatabaseClient = prisma,
) {
  return database.production.findFirst({
    where: {
      sourceProductionId,
      kind: ProductionKind.RETURN,
      status: {
        in: [
          ProductionStatus.DEFERRED,
          ProductionStatus.IN_PROGRESS,
          ProductionStatus.PAUSED,
        ],
      },
    },
    select: {
      id: true,
      status: true,
    },
  });
}

export function findEmployeeReturns(
  employeeId: string,
  database: DatabaseClient = prisma,
) {
  return database.production.findMany({
    where: {
      employeeId,
      kind: ProductionKind.RETURN,
      status: {
        in: [
          ProductionStatus.DEFERRED,
          ProductionStatus.IN_PROGRESS,
          ProductionStatus.PAUSED,
        ],
      },
    },
    include: returnInclude,
    orderBy: [
      {
        createdAt: "asc",
      },
      {
        id: "asc",
      },
    ],
  });
}

export function findReturnForAction(
  productionId: string,
  employeeId: string,
  database: DatabaseClient = prisma,
) {
  return database.production.findFirst({
    where: {
      id: productionId,
      employeeId,
      kind: ProductionKind.RETURN,
    },
    include: returnInclude,
  });
}

export function findReturnProcessAccess(
  employeeId: string,
  processTypeId: string,
  database: DatabaseClient = prisma,
) {
  return database.employeeProcess.findFirst({
    where: {
      employeeId,
      processTypeId,
      employee: {
        active: true,
        role: {
          active: true,
        },
      },
      processType: {
        active: true,
      },
    },
    select: {
      employeeId: true,
    },
  });
}

type ReturnSource = NonNullable<
  Awaited<ReturnType<typeof findReturnSource>>
>;

type CreateReturnInput = {
  source: ReturnSource;
  reason: string;
  now: Date;
};

// A gerência solicita o retrabalho, mas o cronômetro
// só começa quando o funcionário inicia a execução.
export function createQualityReturn(
  input: CreateReturnInput,
  database: Prisma.TransactionClient,
) {
  return database.production.create({
    data: {
      shoeId: input.source.shoeId,
      employeeId: input.source.employeeId,
      processTypeId: input.source.processTypeId,
      unit: input.source.unit,
      sourceProductionId: input.source.id,
      returnReason: input.reason,
      kind: ProductionKind.RETURN,
      status: ProductionStatus.DEFERRED,
      commissionAmountSnapshot: new Prisma.Decimal(0),
      startedAt: input.now,
    },
    include: returnInclude,
  });
}

export function createReturnWorkSession(
  productionId: string,
  kind: SessionKind,
  now: Date,
  database: Prisma.TransactionClient,
) {
  return database.workSession.create({
    data: {
      productionId,
      kind,
      startedAt: now,
    },
  });
}