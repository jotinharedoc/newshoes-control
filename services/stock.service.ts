import { Prisma, StockRequestStatus } from "@/lib/generated/prisma/client";
import * as repository from "@/repositories/stock.repository";
import { createAuditEvent } from "@/repositories/administration.repository";
import { MANAGEMENT_PERMISSION } from "@/utils/access";
import { AuthError } from "@/types/auth.types";

function invalid(message: string): never { throw new AuthError("INVALID_INPUT", message, 400); }
async function authorize(db: Prisma.TransactionClient, actorId: string, management = false) {
  const actor = await repository.findStockActor(db, actorId);
  const manager = actor?.role.permissions.some(p => p.permission.code === MANAGEMENT_PERMISSION) ?? false;
  if (!actor || (management && !manager)) throw new AuthError("FORBIDDEN", "Acesso não autorizado.", 403);
  return { manager };
}
export function parseStockStatus(value: unknown): StockRequestStatus {
  if (typeof value !== "string" || !Object.values(StockRequestStatus).includes(value as StockRequestStatus)) invalid("Status de solicitação inválido.");
  return value as StockRequestStatus;
}
export function parseStockQuantity(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if ((typeof value !== "string" && typeof value !== "number") || !/^\d{1,8}([.,]\d{1,2})?$/.test(String(value))) invalid("Informe uma quantidade positiva, com até duas casas decimais.");
  const amount = new Prisma.Decimal(String(value).replace(",", "."));
  if (amount.lte(0)) invalid("A quantidade deve ser maior que zero.");
  return amount;
}
const transitions: Record<StockRequestStatus, readonly StockRequestStatus[]> = {
  PENDING: ["APPROVED", "REJECTED", "CANCELLED"], APPROVED: ["ORDERED", "CANCELLED"],
  ORDERED: ["RECEIVED", "CANCELLED"], RECEIVED: [], REJECTED: [], CANCELLED: [],
};
export function assertStockTransition(from: StockRequestStatus, to: StockRequestStatus) {
  if (!transitions[from].includes(to)) throw new AuthError("INVALID_INPUT", "Transição inválida para o status atual. Atualize a solicitação.", 409);
}

export async function createStockRequest(actorId: string, input: Record<string, unknown>) {
  if (typeof input.stockItemId !== "string" || !input.stockItemId) invalid("Selecione um material cadastrado.");
  const stockItemId = input.stockItemId;
  const quantity = parseStockQuantity(input.quantity);
  if (input.note !== undefined && input.note !== null && (typeof input.note !== "string" || input.note.length > 1000)) invalid("Use uma observação de até 1.000 caracteres.");
  const note = typeof input.note === "string" ? input.note.trim() || null : null;
  return repository.stockTransaction(async db => {
    await authorize(db, actorId);
    if (!await repository.findStockItem(db, stockItemId)) invalid("Material inexistente ou inativo.");
    const request = await repository.createStockRequestRecord(db, { stockItemId, requestedByEmployeeId: actorId, quantity, note });
    // Free-text notes are deliberately excluded from the audit trail.
    await createAuditEvent(db, { actorEmployeeId: actorId, action: "STOCK_REQUEST_CREATED", targetType: "STOCK_REQUEST", targetId: request.id,
      reason: "Solicitação de material criada", beforeData: {}, afterData: { stockItemId, status: request.status, quantity: quantity?.toString() ?? null } });
    return request;
  });
}
export async function changeStockRequestStatus(actorId: string, id: string, statusInput: unknown) {
  const status = parseStockStatus(statusInput);
  return repository.stockTransaction(async db => {
    await authorize(db, actorId, true);
    const before = await repository.lockStockRequest(db, id);
    if (!before) throw new AuthError("INVALID_INPUT", "Solicitação não encontrada.", 404);
    assertStockTransition(before.status, status);
    const after = await repository.updateStockRequestRecord(db, id, status, actorId);
    await createAuditEvent(db, { actorEmployeeId: actorId, action: "STOCK_REQUEST_UPDATED", targetType: "STOCK_REQUEST", targetId: id,
      reason: "Status da solicitação de material alterado", beforeData: { status: before.status }, afterData: { status } });
    return after;
  });
}
export async function listStockRequests(actorId: string, filters: { status?: string; cursor?: string } = {}) {
  const status = filters.status ? parseStockStatus(filters.status) : undefined;
  return repository.stockTransaction(async db => {
    const { manager } = await authorize(db, actorId);
    const requestedByEmployeeId = manager ? undefined : actorId;
    const [rows, pendingStockRequests] = await Promise.all([
      repository.listStockRequestRecords(db, { ...filters, status, requestedByEmployeeId }),
      repository.countPendingStockRequests(db, requestedByEmployeeId),
    ]);
    const requests = rows.slice(0, 50);
    return { requests, pendingStockRequests, nextCursor: rows.length > 50 ? requests.at(-1)!.id : null };
  });
}
