-- Additive only: preserves all existing breaks, work, commissions and corrections.
ALTER TYPE "EmployeeBreakKind" ADD VALUE 'OPERATIONAL';

ALTER TABLE "ManagementCorrection"
  ADD COLUMN "action" TEXT,
  ADD COLUMN "targetType" TEXT,
  ADD COLUMN "targetId" TEXT;

CREATE INDEX "ManagementCorrection_action_idx" ON "ManagementCorrection"("action");
CREATE INDEX "ManagementCorrection_targetType_targetId_idx" ON "ManagementCorrection"("targetType", "targetId");
