import { prisma } from "@/lib/prisma";

export async function findActiveEmployees() {
  return prisma.employee.findMany({
    where: {
      active: true,
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

export async function findEmployeeForAuthentication(employeeId: string) {
  return prisma.employee.findFirst({
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
  failedPinAttempts: number,
  pinLockedUntil: Date | null,
) {
  return prisma.employee.update({
    where: {
      id: employeeId,
    },
    data: {
      failedPinAttempts,
      pinLockedUntil,
    },
  });
}

export async function resetPinAttempts(employeeId: string) {
  return prisma.employee.update({
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