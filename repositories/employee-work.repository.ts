import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";

const workSelect = {
  id: true, shoeId: true, employeeId: true, processTypeId: true,
  kind: true, unit: true, status: true, version: true, completedAt: true,
  shoe: { select: { code: true } }, processType: { select: { name: true } },
} satisfies Prisma.ProductionSelect;

export function findEmployeeDayWorks(employeeId: string, start: Date, now: Date) {
  const activity = { startedAt: { lte: now }, OR: [{ endedAt: null }, { endedAt: { gte: start } }] } satisfies Prisma.WorkSessionWhereInput;
  return prisma.production.findMany({
    where: { employeeId, sessions: { some: activity } },
    select: { ...workSelect, sessions: { where: activity, select: { startedAt: true, endedAt: true } } },
  });
}

export function findOwnWork(db: Prisma.TransactionClient, employeeId: string, id: string) {
  return db.production.findFirst({
    where: { id, employeeId },
    select: { ...workSelect, sessions: { select: { startedAt: true, endedAt: true } } },
  });
}

export function findWorkAccess(db: Prisma.TransactionClient, employeeId: string, processTypeId: string) {
  return db.employeeProcess.findFirst({
    where: { employeeId, processTypeId, employee: { active: true, role: { active: true } }, processType: { active: true } },
    select: { processTypeId: true },
  });
}

export function auditWorkReopen(db: Prisma.TransactionClient, employeeId: string, production: { id: string; version: number; completedAt: Date | null }, now: Date) {
  return db.managementCorrection.create({ data: {
    actorEmployeeId: employeeId, productionId: production.id, action: "PRODUCTION_REOPENED",
    reason: "Funcionário retomou trabalho concluído antes do término do serviço.",
    beforeData: { status: "COMPLETED", version: production.version, completedAt: production.completedAt?.toISOString() ?? null },
    afterData: { status: "IN_PROGRESS", version: production.version + 1, completedAt: null, resumedAt: now.toISOString(), sessionKind: "RESUME" },
  } });
}
