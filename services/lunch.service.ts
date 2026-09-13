import {
  EmployeeBreakKind,
  Prisma,
} from "@/lib/generated/prisma/client";

import { findOpenEmployeeBreak } from "@/repositories/employee-break.repository";

import {
  getEmployeeBreakOverview,
  startEmployeeBreak,
} from "@/services/employee-break.service";

import { ProductionError } from "@/types/production-error.types";

function toLunchOverview(
  overview: Awaited<ReturnType<typeof getEmployeeBreakOverview>>,
) {
  const current = overview.current;

  return {
    current:
      current?.kind === EmployeeBreakKind.LUNCH
        ? {
            id: current.id,
            startedAt: current.startedAt,
            pausedProductionId: current.pausedProductionId,
          }
        : null,
    observedAt: overview.observedAt,
  };
}

export async function getLunchOverview(employeeId: string) {
  return toLunchOverview(
    await getEmployeeBreakOverview(employeeId),
  );
}

export type LunchOverview = Awaited<
  ReturnType<typeof getLunchOverview>
>;

export async function startLunch(employeeId: string) {
  return toLunchOverview(
    await startEmployeeBreak(employeeId, EmployeeBreakKind.LUNCH),
  );
}

export async function finishLunch(
  employeeId: string,
  lunchId: string,
) {
  // Valida o tipo e encerra dentro da mesma transação.
  // A rota antiga de almoço não pode encerrar um banheiro.
  const { prisma } = await import("@/lib/prisma");

  await prisma.$transaction(
    async (database) => {
      const current = await findOpenEmployeeBreak(
        employeeId,
        database,
      );

      if (
        !current ||
        current.id !== lunchId ||
        current.kind !== EmployeeBreakKind.LUNCH
      ) {
        throw new ProductionError(
          "INVALID_PRODUCTION_STATE",
          "Este almoço não está aberto. Atualize a tela.",
          409,
        );
      }

      const result = await database.employeeBreak.updateMany({
        where: {
          id: lunchId,
          employeeId,
          kind: EmployeeBreakKind.LUNCH,
          endedAt: null,
        },
        data: {
          endedAt: new Date(),
        },
      });

      if (result.count !== 1) {
        throw new ProductionError(
          "PRODUCTION_CONFLICT",
          "O almoço foi alterado. Atualize a tela.",
          409,
        );
      }
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );

  return getLunchOverview(employeeId);
}