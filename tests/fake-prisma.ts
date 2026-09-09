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
};

(globalThis as unknown as { prisma: PrismaClient }).prisma = prisma as unknown as PrismaClient;
process.env.DATABASE_URL = "postgresql://test:test@localhost:1/test";
