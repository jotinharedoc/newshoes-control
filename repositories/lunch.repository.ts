import { prisma } from "@/lib/prisma";

import {
  EmployeeBreakKind,
  Prisma,
  ProductionStatus,
} from "@/lib/generated/prisma/client";

type DatabaseClient = Prisma.TransactionClient | typeof prisma;

export function findOpenLunch(
  employeeId: string,
  database: DatabaseClient = prisma,
) {
  return database.employeeBreak.findFirst({
    where: {
      employeeId,
      kind: EmployeeBreakKind.LUNCH,
      endedAt: null,
    },
    select: {
      id: true,
      startedAt: true,
      pausedProductionId: true,
    },
    orderBy: {
      startedAt: "desc",
    },
  });
}

export function findLunchProductions(
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

export function createLunch(
  employeeId: string,
  pausedProductionId: string | null,
  now: Date,
  database: Prisma.TransactionClient,
) {
  return database.employeeBreak.create({
    data: {
      employeeId,
      kind: EmployeeBreakKind.LUNCH,
      pausedProductionId,
      startedAt: now,
    },
    select: {
      id: true,
      startedAt: true,
      pausedProductionId: true,
    },
  });
}

export function closeLunch(
  lunchId: string,
  employeeId: string,
  now: Date,
  database: Prisma.TransactionClient,
) {
  return database.employeeBreak.updateMany({
    where: {
      id: lunchId,
      employeeId,
      kind: EmployeeBreakKind.LUNCH,
      endedAt: null,
    },
    data: {
      endedAt: now,
    },
  });
}