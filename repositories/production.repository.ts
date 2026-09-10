import { prisma } from "@/lib/prisma";
import {
  Prisma,
  ProductionKind,
  ProductionStatus,
  SessionEndReason,
  SessionKind,
  WorkUnit,
} from "@/lib/generated/prisma/client";

export const HYGIENE_PROCESS_NAME = "Higienização";

type DatabaseClient = Prisma.TransactionClient | typeof prisma;

const productionViewInclude = {
  shoe: { select: { code: true } },
  processType: { select: { name: true } },
  sessions: {
    select: { startedAt: true, endedAt: true },
    orderBy: { startedAt: "asc" as const },
  },
} satisfies Prisma.ProductionInclude;

export type ProductionViewRecord = Prisma.ProductionGetPayload<{
  include: typeof productionViewInclude;
}>;

export function runProductionTransaction<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
) {
  return prisma.$transaction(operation, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}

export function findHygieneAccess(
  employeeId: string,
  database: DatabaseClient = prisma,
) {
  return database.employeeProcess.findFirst({
    where: {
      employeeId,
      employee: { active: true, role: { active: true } },
      processType: { name: HYGIENE_PROCESS_NAME, active: true },
    },
    select: {
      processType: {
        select: {
          id: true,
          name: true,
          rules: {
            where: { unit: WorkUnit.PAIR, active: true },
            select: { commissionAmount: true },
            take: 1,
          },
        },
      },
    },
  });
}

export function findHygieneProductions(
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
    include: productionViewInclude,
    orderBy: { updatedAt: "desc" },
  });
}

export function findBlockingProduction(
  employeeId: string,
  database: DatabaseClient = prisma,
) {
  return database.production.findFirst({
    where: {
      employeeId,
      status: { in: [ProductionStatus.IN_PROGRESS, ProductionStatus.PAUSED] },
    },
    select: { id: true },
  });
}

export function findHygieneProductionForAction(
  productionId: string,
  employeeId: string,
  database: DatabaseClient = prisma,
) {
  return database.production.findFirst({
    where: {
      id: productionId,
      employeeId,
      kind: ProductionKind.STANDARD,
      unit: WorkUnit.PAIR,
      processType: { name: HYGIENE_PROCESS_NAME },
    },
    include: productionViewInclude,
  });
}

export function findStandardHygieneForShoe(
  shoeId: string,
  processTypeId: string,
  database: DatabaseClient = prisma,
) {
  return database.production.findFirst({
    where: {
      shoeId,
      processTypeId,
      kind: ProductionKind.STANDARD,
      unit: WorkUnit.PAIR,
      status: { not: ProductionStatus.CANCELLED },
    },
    select: { id: true },
  });
}

export function upsertShoe(code: string, database: DatabaseClient = prisma) {
  return database.shoe.upsert({
    where: { code },
    update: {},
    create: { code },
    select: { id: true },
  });
}

type CreateHygieneProductionInput = {
  employeeId: string;
  processTypeId: string;
  shoeId: string;
  commissionAmountSnapshot: Prisma.Decimal;
  now: Date;
};

export function createHygieneProduction(
  input: CreateHygieneProductionInput,
  database: DatabaseClient,
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
    include: productionViewInclude,
  });
}

export function closeOpenWorkSession(
  productionId: string,
  endedAt: Date,
  endReason: SessionEndReason,
  database: DatabaseClient,
) {
  return database.workSession.updateMany({
    where: { productionId, endedAt: null },
    data: { endedAt, endReason },
  });
}

export function createWorkSession(
  productionId: string,
  kind: SessionKind,
  startedAt: Date,
  database: DatabaseClient,
) {
  return database.workSession.create({
    data: { productionId, kind, startedAt },
  });
}

type TransitionProductionInput = {
  productionId: string;
  employeeId: string;
  version: number;
  from: ProductionStatus[];
  status: ProductionStatus;
  completedAt?: Date;
};

export function transitionProduction(
  input: TransitionProductionInput,
  database: DatabaseClient,
) {
  return database.production.updateMany({
    where: {
      id: input.productionId,
      employeeId: input.employeeId,
      version: input.version,
      status: { in: input.from },
    },
    data: {
      status: input.status,
      version: { increment: 1 },
      ...(input.completedAt ? { completedAt: input.completedAt } : {}),
    },
  });
}

export function createCommissionEntry(
  productionId: string,
  amount: Prisma.Decimal,
  earnedAt: Date,
  database: DatabaseClient,
) {
  return database.commissionEntry.create({
    data: { productionId, amount, earnedAt },
  });
}

