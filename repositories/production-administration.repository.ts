import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
export async function listAdministrativeProductions(code?: string) {
  return prisma.production.findMany({ where: code ? { shoe: { code } } : {}, orderBy: [{ startedAt: "desc" }, { id: "desc" }], take: 100,
    select: { id: true, version: true, status: true, cancelledFromStatus: true, occurrenceId: true,
      shoe: { select: { code: true } }, occurrence: { select: { sequence: true } },
      employee: { select: { id: true, name: true } }, processType: { select: { id: true, name: true } },
      unit: true, kind: true, startedAt: true, completedAt: true, commission: { select: { amount: true } },
      sessions: { select: { startedAt: true, endedAt: true } } } });
}
export async function lockAdministrativeProduction(db: Prisma.TransactionClient, id: string) {
  await db.$queryRaw`SELECT "id" FROM "Production" WHERE "id" = ${id} FOR UPDATE`;
  return db.production.findUnique({ where: { id }, include: { shoe: true, occurrence: true, employee: { select: { id: true, name: true } },
    processType: true, sessions: true, commission: true, pausedByBreaks: { where: { endedAt: null } } } });
}
