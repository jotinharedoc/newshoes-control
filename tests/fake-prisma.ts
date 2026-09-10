import type { Prisma, PrismaClient } from "../lib/generated/prisma/client";

// No real database client is created. An unexpected query fails immediately.
async function unexpectedQuery(args: unknown): Promise<unknown> {
  void args;
  throw new Error("Consulta não simulada no teste");
}

export const prisma = {
  employee: {
    findFirst: (args: Prisma.EmployeeFindFirstArgs) => unexpectedQuery(args),
    update: (args: Prisma.EmployeeUpdateArgs) => unexpectedQuery(args),
  },
  managementSession: {
    findFirst: (args: Prisma.ManagementSessionFindFirstArgs) => unexpectedQuery(args),
    create: (args: Prisma.ManagementSessionCreateArgs) => unexpectedQuery(args),
    updateMany: (args: Prisma.ManagementSessionUpdateManyArgs) => unexpectedQuery(args),
  },
  employeeProcess: {
    findFirst: (args: Prisma.EmployeeProcessFindFirstArgs) => unexpectedQuery(args),
  },
  production: {
    findFirst: (args: Prisma.ProductionFindFirstArgs) => unexpectedQuery(args),
    findMany: (args: Prisma.ProductionFindManyArgs) => unexpectedQuery(args),
    create: (args: Prisma.ProductionCreateArgs) => unexpectedQuery(args),
    updateMany: (args: Prisma.ProductionUpdateManyArgs) => unexpectedQuery(args),
  },
  shoe: {
    upsert: (args: Prisma.ShoeUpsertArgs) => unexpectedQuery(args),
  },
  workSession: {
    updateMany: (args: Prisma.WorkSessionUpdateManyArgs) => unexpectedQuery(args),
    create: (args: Prisma.WorkSessionCreateArgs) => unexpectedQuery(args),
  },
  commissionEntry: {
    create: (args: Prisma.CommissionEntryCreateArgs) => unexpectedQuery(args),
  },
  $transaction: async (
    operation: (client: PrismaClient) => Promise<unknown>,
  ) => operation(prisma as unknown as PrismaClient),
};

(globalThis as unknown as { prisma: PrismaClient }).prisma = prisma as unknown as PrismaClient;
process.env.DATABASE_URL = "postgresql://test:test@localhost:1/test";
