-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "mustChangePin" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Employee_pinLockedUntil_idx" ON "Employee"("pinLockedUntil");
