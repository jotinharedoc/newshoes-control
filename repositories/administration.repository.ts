import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";

export const publicEmployeeSelect = {
  id: true, name: true, active: true, roleId: true, mustChangePin: true,
  role: { select: { id: true, name: true, active: true } },
  processes: { select: { processTypeId: true, processType: { select: { name: true } } } },
} satisfies Prisma.EmployeeSelect;

export function runAdministrationTransaction<T>(operation: (db: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export function listAdministrationEmployees() {
  return prisma.employee.findMany({ select: publicEmployeeSelect, orderBy: { name: "asc" } });
}

export async function administrationOptions() {
  const [roles, processes, rules] = await Promise.all([
    prisma.role.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.processType.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.processRule.findMany({ where: { active: true, processType: { active: true } }, include: { processType: { select: { name: true } } }, orderBy: [{ processTypeId: "asc" }, { unit: "asc" }] }),
  ]);
  return { roles, processes, rules: rules.map(rule => ({ id: rule.id, processName: rule.processType.name, unit: rule.unit, amount: rule.commissionAmount.toFixed(2) })) };
}

export function listAdministrationAudit(filters: { start?: Date; end?: Date; actorId?: string; action?: string; targetType?: string }) {
  return prisma.managementCorrection.findMany({
    where: {
      createdAt: { gte: filters.start, lt: filters.end },
      actorEmployeeId: filters.actorId || undefined,
      action: filters.action || undefined, targetType: filters.targetType || undefined,
    },
    include: { actor: { select: { id: true, name: true } }, employeeBreak: { select: { kind: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 200,
  });
}

export function createAuditEvent(db: Prisma.TransactionClient, event: {
  actorEmployeeId: string; action: string; targetType: string; targetId: string;
  reason: string; beforeData: Prisma.InputJsonValue; afterData: Prisma.InputJsonValue;
  employeeBreakId?: string;
}) {
  return db.managementCorrection.create({ data: event });
}

export async function lockAdministration(db: Prisma.TransactionClient) {
  await db.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(9092601)`;
}
const managerRole = { active: true, permissions: { some: { permission: { code: "management.access" } } } };
export function findAdministrationActor(db: Prisma.TransactionClient, id: string) {
  return db.employee.findFirst({ where: { id, active: true, mustChangePin: false, role: managerRole }, select: { id: true } });
}
export function findAssignableRole(db: Prisma.TransactionClient, id: string) {
  return db.role.findFirst({ where: { id, active: true }, include: { permissions: { include: { permission: true } } } });
}
export function countAssignableProcesses(db: Prisma.TransactionClient, ids: string[]) {
  return db.processType.count({ where: { id: { in: ids }, active: true } });
}
export async function findEmployeeForAdministration(db: Prisma.TransactionClient, id: string) {
  await db.$queryRaw`SELECT "id" FROM "Employee" WHERE "id" = ${id} FOR UPDATE`;
  return db.employee.findUnique({ where: { id }, select: publicEmployeeSelect });
}
export function countActiveManagers(db: Prisma.TransactionClient, id: string, exclude = false) {
  return db.employee.count({ where: { id: exclude ? { not: id } : id, active: true, role: managerRole } });
}
export async function saveEmployeeRecord(db: Prisma.TransactionClient, data: { name: string; roleId: string; active: boolean; processIds: string[] }, id?: string, pinHash?: string) {
  if (id) await db.employeeProcess.deleteMany({ where: { employeeId: id } });
  const fields = { name: data.name, roleId: data.roleId, active: data.active, processes: { create: data.processIds.map(processTypeId => ({ processTypeId })) } };
  return id ? db.employee.update({ where: { id }, data: fields, select: publicEmployeeSelect })
    : db.employee.create({ data: { ...fields, pinHash, mustChangePin: true }, select: publicEmployeeSelect });
}
export function revokeEmployeeSessions(db: Prisma.TransactionClient, employeeId: string) {
  return db.managementSession.updateMany({ where: { employeeId, revokedAt: null }, data: { revokedAt: new Date() } });
}
export function resetEmployeeCredentials(db: Prisma.TransactionClient, id: string, pinHash: string) {
  return db.employee.update({ where: { id }, data: { pinHash, mustChangePin: true, failedPinAttempts: 0, pinLockedUntil: null }, select: { id: true } });
}
export function findCommissionRule(db: Prisma.TransactionClient, id: string) {
  return db.processRule.findFirst({ where: { id, active: true, processType: { active: true } }, include: { processType: { select: { name: true } } } });
}
export function saveCommissionRule(db: Prisma.TransactionClient, id: string, commissionAmount: Prisma.Decimal) {
  return db.processRule.update({ where: { id }, data: { commissionAmount } });
}
