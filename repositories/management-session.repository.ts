import { prisma } from "@/lib/prisma";

interface CreateSessionInput {
  employeeId: string;
  tokenHash: string;
  expiresAt: Date;
}

export async function createManagementSession({
  employeeId,
  tokenHash,
  expiresAt,
}: CreateSessionInput) {
  return prisma.managementSession.create({
    data: {
      employeeId,
      tokenHash,
      expiresAt,
    },
  });
}

export async function findActiveSession(tokenHash: string) {
  return prisma.managementSession.findFirst({
    where: {
      tokenHash,
      revokedAt: null,
      expiresAt: {
        gt: new Date(),
      },
    },
    include: {
      employee: {
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
      },
    },
  });
}

export async function revokeSession(tokenHash: string) {
  return prisma.managementSession.updateMany({
    where: {
      tokenHash,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}