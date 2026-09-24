import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";

// Lock before reading the account. PostgreSQL serializes decisions for the same
// employee, including resets and session creation, across application instances.
// Business errors must be returned until the commit succeeds.
export async function runAuthenticationTransaction<T>(
  employeeId: string,
  operation: (database: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async database => {
        // Parameterized SQL: Prisma does not expose SELECT FOR UPDATE.
        await database.$queryRaw`SELECT "id" FROM "Employee" WHERE "id" = ${employeeId} FOR UPDATE`;
        return operation(database);
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt >= 9) throw error;
      await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 10));
    }
  }
}

export async function findActiveEmployees() {
  return prisma.employee.findMany({
    where: {
      active: true,
      role: { active: true },
    },
    select: {
      id: true,
      name: true,
      mustChangePin: true,
      role: {
        select: {
          name: true,
          permissions: {
            select: {
              permission: {
                select: {
                  code: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: {
      name: "asc",
    },
  });
}

export async function findEmployeeForAuthentication(employeeId: string, database: Prisma.TransactionClient) {
  return database.employee.findFirst({
    where: {
      id: employeeId,
      active: true,
    },
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
  });
}

export async function registerFailedPinAttempt(
  employeeId: string,
  database: Prisma.TransactionClient,
) {
  return database.employee.update({
    where: {
      id: employeeId,
    },
    data: {
      failedPinAttempts: { increment: 1 },
    },
  });
}

export async function blockEmployeePin(employeeId: string, pinLockedUntil: Date, database: Prisma.TransactionClient) {
  return database.employee.update({ where: { id: employeeId }, data: { pinLockedUntil } });
}

export async function resetPinAttempts(employeeId: string, database: Prisma.TransactionClient) {
  return database.employee.update({
    where: {
      id: employeeId,
    },
    data: {
      failedPinAttempts: 0,
      pinLockedUntil: null,
    },
  });
}

export async function updateEmployeePin(
  employeeId: string,
  pinHash: string,
) {
  return prisma.employee.update({
    where: {
      id: employeeId,
    },
    data: {
      pinHash,
      mustChangePin: false,
      failedPinAttempts: 0,
      pinLockedUntil: null,
    },
  });
}
