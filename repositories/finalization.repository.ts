import { prisma } from "@/lib/prisma";
import {
  Prisma,
  ProductionKind,
  ProductionStatus,
  SessionKind,
  WorkUnit,
} from "@/lib/generated/prisma/client";

type DatabaseClient = Prisma.TransactionClient | typeof prisma;

const productionInclude = {
  shoe: { select: { code: true } },
  processType: { select: { name: true } },
  sessions: {
    select: { startedAt: true, endedAt: true },
    orderBy: { startedAt: "asc" as const },
  },
} satisfies Prisma.ProductionInclude;

export type FinalizationRecord = Prisma.ProductionGetPayload<{
  include: typeof productionInclude;
}>;

export function findFinalizationAccess(
  employeeId: string,
  database: DatabaseClient = prisma,
) {
  return database.employeeProcess.findFirst({
    where: {
      employeeId,
      employee: {
        active: true,
        role: { active: true },
      },
      processType: {
        name: "Finalização",
        active: true,
      },
    },
    select: {
      processType: {
        select: {
          id: true,
          name: true,
          rules: {
            where: { active: true },
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

export function findFinalizationProductions(
  employeeId: string,
  processTypeId: string,
  database: DatabaseClient = prisma,
) {
  return database.production.findMany({
    where: {
      employeeId,
      processTypeId,
      kind: ProductionKind.STANDARD,
      status: {
        in: [
          ProductionStatus.IN_PROGRESS,
          ProductionStatus.PAUSED,
          ProductionStatus.DEFERRED,
        ],
      },
    },
    include: productionInclude,
    orderBy: { updatedAt: "desc" },
  });
}

export function findFinalizationForAction(
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
      kind: ProductionKind.STANDARD,
    },
    include: productionInclude,
  });
}

export function findStandardFinalizationsForShoe(
  shoeId: string,
  processTypeId: string,
  database: DatabaseClient = prisma,
) {
  return database.production.findMany({
    where: {
      shoeId,
      processTypeId,
      kind: ProductionKind.STANDARD,
      status: { not: ProductionStatus.CANCELLED },
    },
    select: {
      id: true,
      employeeId: true,
      unit: true,
      status: true,
    },
  });
}

type CreateFinalizationInput = {
  employeeId: string;
  processTypeId: string;
  shoeId: string;
  unit: WorkUnit;
  commissionAmountSnapshot: Prisma.Decimal;
  now: Date;
};

export function createFinalizationProduction(
  input: CreateFinalizationInput,
  database: Prisma.TransactionClient,
) {
  return database.production.create({
    data: {
      employeeId: input.employeeId,
      processTypeId: input.processTypeId,
      shoeId: input.shoeId,
      unit: input.unit,
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
    include: productionInclude,
  });
}