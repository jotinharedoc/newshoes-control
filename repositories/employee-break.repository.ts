import { prisma } from "@/lib/prisma";

import {
  EmployeeBreakKind,
  Prisma,
  ProductionStatus,
} from "@/lib/generated/prisma/client";

type DatabaseClient = Prisma.TransactionClient | typeof prisma;

export function findOpenEmployeeBreak(
  employeeId: string,
  database: DatabaseClient = prisma,
) {
  return database.employeeBreak.findFirst({
    where: {
      employeeId,
      endedAt: null,
    },
    select: {
      id: true,
      kind: true,
      startedAt: true,
      pausedProductionId: true,
    },
    orderBy: {
      startedAt: "desc",
    },
  });
}

export function findEmployeeBreakProductions(
  employeeId: string,
  database: DatabaseClient = prisma,
) {
  return database.production.findMany({
    where: {
      employeeId,
      status: {
        in: [
          ProductionStatus.IN_PROGRESS,
          ProductionStatus.PAUSED,
        ],
      },
    },
    select: {
      id: true,
      status: true,
      version: true,
    },
  });
}

export function findBreakProduction(
  productionId: string,
  employeeId: string,
  database: Prisma.TransactionClient,
) {
  return database.production.findFirst({
    where: {
      id: productionId,
      employeeId,
    },
    select: {
      id: true,
      status: true,
      version: true,
      processTypeId: true,
      sessions: {
        where: {
          endedAt: null,
        },
        select: {
          id: true,
        },
      },
    },
  });
}

export function findBreakProductionAccess(
  employeeId: string,
  processTypeId: string,
  database: Prisma.TransactionClient,
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

export function createEmployeeBreak(
  employeeId: string,
  kind: EmployeeBreakKind,
  pausedProductionId: string | null,
  now: Date,
  database: Prisma.TransactionClient,
) {
  return database.employeeBreak.create({
    data: {
      employeeId,
      kind,
      pausedProductionId,
      startedAt: now,
    },
  });
}

export function closeEmployeeBreak(
  breakId: string,
  employeeId: string,
  now: Date,
  database: Prisma.TransactionClient,
) {
  return database.employeeBreak.updateMany({
    where: {
      id: breakId,
      employeeId,
      endedAt: null,
    },
    data: {
      endedAt: now,
    },
  });
}