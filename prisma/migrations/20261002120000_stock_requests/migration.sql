-- Additive inventory infrastructure. No catalog rows or existing business data changed.
CREATE TYPE "StockRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'ORDERED', 'RECEIVED', 'REJECTED', 'CANCELLED');
CREATE TABLE "StockItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "StockItem_code_key" ON "StockItem"("code");
CREATE TABLE "StockRequest" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "stockItemId" TEXT NOT NULL,
  "requestedByEmployeeId" TEXT NOT NULL,
  "quantity" DECIMAL(10,2),
  "note" TEXT,
  "status" "StockRequestStatus" NOT NULL DEFAULT 'PENDING',
  "handledByEmployeeId" TEXT,
  "handledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StockRequest_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockRequest_requestedByEmployeeId_fkey" FOREIGN KEY ("requestedByEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockRequest_handledByEmployeeId_fkey" FOREIGN KEY ("handledByEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockRequest_quantity_positive_check" CHECK ("quantity" IS NULL OR "quantity" > 0)
);
-- Match own-request feeds and management status filters/pending counts.
CREATE INDEX "StockRequest_requestedByEmployeeId_createdAt_id_idx" ON "StockRequest"("requestedByEmployeeId", "createdAt", "id");
CREATE INDEX "StockRequest_status_createdAt_id_idx" ON "StockRequest"("status", "createdAt", "id");
CREATE INDEX "StockRequest_stockItemId_idx" ON "StockRequest"("stockItemId");
-- Widen only the typed audit targets; preserve every existing correction invariant.
ALTER TABLE "ManagementCorrection"
  DROP CONSTRAINT "ManagementCorrection_exactly_one_target_check",
  ADD CONSTRAINT "ManagementCorrection_exactly_one_target_check" CHECK (
    num_nonnulls("productionId", "workSessionId", "employeeBreakId") = 1
    OR (
      num_nonnulls("productionId", "workSessionId", "employeeBreakId") = 0
      AND "action" IS NOT NULL AND btrim("action") <> ''
      AND "targetType" IS NOT NULL AND "targetType" IN ('EMPLOYEE', 'PROCESS_RULE', 'STOCK_ITEM', 'STOCK_REQUEST')
      AND "targetId" IS NOT NULL AND btrim("targetId") <> ''
    )
  );
