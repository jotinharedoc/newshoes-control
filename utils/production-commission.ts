import { Prisma } from "@/lib/generated/prisma/client";
import { MANAGEMENT_PERMISSION } from "@/utils/access";

/** Snapshot at creation time only; never rewrites historical productions. */
export function productionCommission(amount: Prisma.Decimal, access: {
  employee?: { role: { permissions: { permission: { code: string } }[] } };
}) {
  return access.employee?.role.permissions.some(p => p.permission.code === MANAGEMENT_PERMISSION)
    ? new Prisma.Decimal(0) : amount;
}
