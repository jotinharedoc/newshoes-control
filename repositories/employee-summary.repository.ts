import { prisma } from "@/lib/prisma";

export async function findEmployeeMonthlySummary(employeeId: string, start: Date, endExclusive: Date) {
  const [employee, productions, ledger] = await Promise.all([
    prisma.employee.findFirst({ where: { id: employeeId }, select: { id: true, name: true, active: true } }),
    prisma.production.findMany({
      where: { employeeId, kind: "STANDARD", status: "COMPLETED", completedAt: { gte: start, lt: endExclusive } },
      select: { unit: true, processType: { select: { name: true } } },
    }),
    prisma.commissionEntry.aggregate({
      where: { earnedAt: { gte: start, lt: endExclusive }, production: { employeeId, kind: "STANDARD", status: { not: "CANCELLED" } } },
      _sum: { amount: true },
    }),
  ]);
  return { employee, productions, amount: ledger._sum.amount };
}
