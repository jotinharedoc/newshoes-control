/*
  Warnings:

  - Added the required column `commissionAmountSnapshot` to the `Production` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "EmployeeBreakKind" AS ENUM ('LUNCH');

-- AlterEnum
ALTER TYPE "ProductionStatus" ADD VALUE 'DEFERRED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SessionEndReason" ADD VALUE 'LUNCH';
ALTER TYPE "SessionEndReason" ADD VALUE 'DEFERRED';
ALTER TYPE "SessionEndReason" ADD VALUE 'CANCELLED';

-- AlterEnum
ALTER TYPE "SessionKind" ADD VALUE 'RESUME';

-- DropForeignKey
ALTER TABLE "Production" DROP CONSTRAINT "Production_sourceProductionId_fkey";

-- AlterTable
ALTER TABLE "Production" ADD COLUMN     "commissionAmountSnapshot" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "returnReason" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AddCheckConstraint
ALTER TABLE "Production" ADD CONSTRAINT "Production_valid_completion_time_check" CHECK (
    "completedAt" IS NULL OR "completedAt" >= "startedAt"
);

-- AddCheckConstraint
ALTER TABLE "Production" ADD CONSTRAINT "Production_non_negative_commission_snapshot_check" CHECK (
    "commissionAmountSnapshot" >= 0
);

-- AddCheckConstraint
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_valid_time_check" CHECK (
    "endedAt" IS NULL OR "endedAt" >= "startedAt"
);

-- AddCheckConstraint
ALTER TABLE "Production" ADD CONSTRAINT "Production_returnReason_check" CHECK (
    ("kind" = 'RETURN' AND "returnReason" IS NOT NULL AND btrim("returnReason") <> '')
    OR
    ("kind" <> 'RETURN' AND "returnReason" IS NULL)
);

-- AddCheckConstraint
ALTER TABLE "Production" ADD CONSTRAINT "Production_sourceProductionId_check" CHECK (
    ("kind" = 'RETURN' AND "sourceProductionId" IS NOT NULL)
    OR
    ("kind" <> 'RETURN' AND "sourceProductionId" IS NULL)
);

-- AddCheckConstraint
ALTER TABLE "Production" ADD CONSTRAINT "Production_sourceProduction_not_self_check" CHECK (
    "sourceProductionId" IS NULL OR "sourceProductionId" <> "id"
);

-- CreateTable
CREATE TABLE "EmployeeBreak" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kind" "EmployeeBreakKind" NOT NULL DEFAULT 'LUNCH',
    "pausedProductionId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeBreak_pkey" PRIMARY KEY ("id")
);

-- AddCheckConstraint
ALTER TABLE "EmployeeBreak" ADD CONSTRAINT "EmployeeBreak_valid_time_check" CHECK (
    "endedAt" IS NULL OR "endedAt" >= "startedAt"
);

-- CreateTable
CREATE TABLE "ManagementCorrection" (
    "id" TEXT NOT NULL,
    "actorEmployeeId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "beforeData" JSONB NOT NULL,
    "afterData" JSONB NOT NULL,
    "productionId" TEXT,
    "workSessionId" TEXT,
    "employeeBreakId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManagementCorrection_pkey" PRIMARY KEY ("id")
);

-- AddCheckConstraint
ALTER TABLE "ManagementCorrection" ADD CONSTRAINT "ManagementCorrection_reason_check" CHECK (
    btrim("reason") <> ''
);

-- AddCheckConstraint
ALTER TABLE "ManagementCorrection" ADD CONSTRAINT "ManagementCorrection_exactly_one_target_check" CHECK (
    num_nonnulls("productionId", "workSessionId", "employeeBreakId") = 1
);

-- CreateIndex
CREATE INDEX "EmployeeBreak_employeeId_idx" ON "EmployeeBreak"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeBreak_pausedProductionId_idx" ON "EmployeeBreak"("pausedProductionId");

-- CreateIndex
CREATE INDEX "EmployeeBreak_startedAt_idx" ON "EmployeeBreak"("startedAt");

-- CreateIndex
CREATE INDEX "ManagementCorrection_actorEmployeeId_idx" ON "ManagementCorrection"("actorEmployeeId");

-- CreateIndex
CREATE INDEX "ManagementCorrection_productionId_idx" ON "ManagementCorrection"("productionId");

-- CreateIndex
CREATE INDEX "ManagementCorrection_workSessionId_idx" ON "ManagementCorrection"("workSessionId");

-- CreateIndex
CREATE INDEX "ManagementCorrection_employeeBreakId_idx" ON "ManagementCorrection"("employeeBreakId");

-- CreateIndex
CREATE INDEX "ManagementCorrection_createdAt_idx" ON "ManagementCorrection"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkSession_one_open_per_production_key"
ON "WorkSession"("productionId")
WHERE "endedAt" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeBreak_one_open_lunch_per_employee_key"
ON "EmployeeBreak"("employeeId")
WHERE "endedAt" IS NULL AND "kind" = 'LUNCH';

-- CreateIndex
CREATE UNIQUE INDEX "Production_one_active_per_employee_key"
ON "Production"("employeeId")
WHERE "status" IN ('IN_PROGRESS', 'PAUSED');

-- CreateIndex
CREATE UNIQUE INDEX "Production_standard_left_coverage_key"
ON "Production"("shoeId", "processTypeId")
WHERE "kind" = 'STANDARD'
  AND "status" <> 'CANCELLED'
  AND "unit" IN ('PAIR', 'LEFT_FOOT');

-- CreateIndex
CREATE UNIQUE INDEX "Production_standard_right_coverage_key"
ON "Production"("shoeId", "processTypeId")
WHERE "kind" = 'STANDARD'
  AND "status" <> 'CANCELLED'
  AND "unit" IN ('PAIR', 'RIGHT_FOOT');

-- AddForeignKey
ALTER TABLE "Production" ADD CONSTRAINT "Production_sourceProductionId_fkey" FOREIGN KEY ("sourceProductionId") REFERENCES "Production"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeBreak" ADD CONSTRAINT "EmployeeBreak_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeBreak" ADD CONSTRAINT "EmployeeBreak_pausedProductionId_fkey" FOREIGN KEY ("pausedProductionId") REFERENCES "Production"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagementCorrection" ADD CONSTRAINT "ManagementCorrection_actorEmployeeId_fkey" FOREIGN KEY ("actorEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagementCorrection" ADD CONSTRAINT "ManagementCorrection_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "Production"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagementCorrection" ADD CONSTRAINT "ManagementCorrection_workSessionId_fkey" FOREIGN KEY ("workSessionId") REFERENCES "WorkSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagementCorrection" ADD CONSTRAINT "ManagementCorrection_employeeBreakId_fkey" FOREIGN KEY ("employeeBreakId") REFERENCES "EmployeeBreak"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
