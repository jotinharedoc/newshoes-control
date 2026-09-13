import { prisma } from "@/lib/prisma";
import {
  Prisma,
  ProductionKind,
  ProductionStatus,
  SessionKind,
  WorkUnit,
} from "@/lib/generated/prisma/client";

type DatabaseClient = Prisma.TransactionClient | typeof prisma;

const PAINTING_PROCESS_NAME = "Pintura";

const paintingInclude = {
  shoe: {
    select: {
      code: true,
    },
  },
  processType: {
    select: {
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
      startedAt: "asc" as const,
    },
  },
} satisfies Prisma.ProductionInclude;

export type PaintingRecord = Prisma.ProductionGetPayload<{
  include: typeof paintingInclude;
}>;

export function findPaintingAccess(
  employeeId: string,
  database: DatabaseClient = prisma,
) {
  return database.employeeProcess.findFirst({
    where: {
      employeeId,
      employee: {
        active: true,
        role: {
          active: true,
        },
      },
      processType: {
        name: PAINTING_PROCESS_NAME,
        active: true,
      },
    },
    select: {
      processType: {
        select: {
          id: true,
          name: true,
          rules: {
            where: {
              unit: WorkUnit.PAIR,
              active: true,
            },
            select: {
              unit: true,
              commissionAmount: true,
            },
          },
        },
      },
    },
  });
}

export function findPaintingProductions(
  employeeId: string,
  processTypeId: string,
  database: DatabaseClient = prisma,
) {
  return database.production.findMany({
    where: {
      employeeId,
      processTypeId,
      unit: WorkUnit.PAIR,
      kind: ProductionKind.STANDARD,
      status: {
        in: [
          ProductionStatus.IN_PROGRESS,
          ProductionStatus.PAUSED,
          ProductionStatus.DEFERRED,
        ],
      },
    },
    include: paintingInclude,
    orderBy: [
      {
        updatedAt: "desc",
      },
      {
        id: "asc",
      },
    ],
  });
}

export function findPaintingForAction(
  productionId: string,
  employeeId: string,
  processTypeId: string,
  database: DatabaseClient = prisma,
) {
  return database.production.findFirst({
    where: {
      id: productionId,
      employeeId,
      processTypeId,
      unit: WorkUnit.PAIR,
      kind: ProductionKind.STANDARD,
      processType: {
        name: PAINTING_PROCESS_NAME,
      },
    },
    include: paintingInclude,
  });
}

export function findStandardPaintingForShoe(
  shoeId: string,
  processTypeId: string,
  database: DatabaseClient = prisma,
) {
  return database.production.findFirst({
    where: {
      shoeId,
      processTypeId,
      kind: ProductionKind.STANDARD,
      status: {
        not: ProductionStatus.CANCELLED,
      },
    },
    select: {
      id: true,
      employeeId: true,
      status: true,
    },
  });
}

type CreatePaintingInput = {
  employeeId: string;
  processTypeId: string;
  shoeId: string;
  commissionAmountSnapshot: Prisma.Decimal;
  now: Date;
};

export function createPaintingProduction(
  input: CreatePaintingInput,
  database: Prisma.TransactionClient,
) {
  return database.production.create({
    data: {
      employeeId: input.employeeId,
      processTypeId: input.processTypeId,
      shoeId: input.shoeId,
      unit: WorkUnit.PAIR,
      kind: ProductionKind.STANDARD,
      status: ProductionStatus.IN_PROGRESS,
      commissionAmountSnapshot: input.commissionAmountSnapshot,
      startedAt: input.now,
      sessions: {
        create: {
          kind: SessionKind.INITIAL,
          startedAt: input.now,
        },
      },
    },
    include: paintingInclude,
  });
}