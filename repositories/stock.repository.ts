import { prisma } from "@/lib/prisma";
import { Prisma, type StockRequestStatus } from "@/lib/generated/prisma/client";

export function stockTransaction<T>(operation: (db: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
export function findStockActor(db: Prisma.TransactionClient, id: string) {
  return db.employee.findFirst({ where: { id, active: true, mustChangePin: false, role: { active: true } },
    select: { id: true, role: { select: { permissions: { select: { permission: { select: { code: true } } } } } } } });
}
export function findStockItem(db: Prisma.TransactionClient, id: string) {
  return db.stockItem.findFirst({ where: { id, active: true } });
}
export function createStockRequestRecord(db: Prisma.TransactionClient, data: { stockItemId: string; requestedByEmployeeId: string; quantity: Prisma.Decimal | null; note: string | null }) {
  return db.stockRequest.create({ data });
}
export async function lockStockRequest(db: Prisma.TransactionClient, id: string) {
  await db.$queryRaw`SELECT "id" FROM "StockRequest" WHERE "id" = ${id} FOR UPDATE`;
  return db.stockRequest.findUnique({ where: { id } });
}
export function updateStockRequestRecord(db: Prisma.TransactionClient, id: string, status: StockRequestStatus, handledByEmployeeId: string) {
  return db.stockRequest.update({ where: { id }, data: { status, handledByEmployeeId, handledAt: new Date() } });
}
export function listStockRequestRecords(db: Prisma.TransactionClient, filters: { requestedByEmployeeId?: string; status?: StockRequestStatus; cursor?: string }) {
  return db.stockRequest.findMany({ where: { requestedByEmployeeId: filters.requestedByEmployeeId, status: filters.status },
    include: { stockItem: { select: { id: true, name: true, code: true } }, requestedBy: { select: { id: true, name: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
  });
}
export function countPendingStockRequests(db: Prisma.TransactionClient, requestedByEmployeeId?: string) {
  return db.stockRequest.count({ where: { status: "PENDING", requestedByEmployeeId } });
}
