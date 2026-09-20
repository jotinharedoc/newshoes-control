import {
  Prisma,
  ProductionStatus,
  SessionEndReason,
} from "@/lib/generated/prisma/client";

import {
  closeOpenWorkSession,
  transitionProduction,
} from "@/repositories/production.repository";

import { assertNoOpenEmployeeBreak } from "@/services/employee-break.service";
import { ProductionError } from "@/types/production-error.types";

type PrepareWorkSwitchInput = {
  employeeId: string;
  targetProductionId?: string;
  now: Date;
};

// Deve ser executada dentro da mesma transação
// que inicia ou retoma o trabalho escolhido.
export async function prepareWorkSwitch(
  input: PrepareWorkSwitchInput,
  database: Prisma.TransactionClient,
) {
  await assertNoOpenEmployeeBreak(input.employeeId, database);

  const otherProductions = await database.production.findMany({
    where: {
      employeeId: input.employeeId,
      ...(input.targetProductionId
        ? {
            id: {
              not: input.targetProductionId,
            },
          }
        : {}),
      status: {
        in: [
          ProductionStatus.IN_PROGRESS,
          ProductionStatus.PAUSED,
        ],
      },
    },
    select: {
      id: true,
      version: true,
      status: true,
      sessions: {
        where: {
          endedAt: null,
        },
        select: {
          id: true,
        },
      },
    },
  });

  for (const production of otherProductions) {
    if (production.status === ProductionStatus.IN_PROGRESS) {
      if (production.sessions.length !== 1) {
        throw new ProductionError(
          "PRODUCTION_CONFLICT",
          "O trabalho atual não possui exatamente uma sessão aberta. Confira os registros.",
          409,
        );
      }

      const closed = await closeOpenWorkSession(
        production.id,
        input.now,
        SessionEndReason.DEFERRED,
        database,
      );

      if (closed.count !== 1) {
        throw new ProductionError(
          "PRODUCTION_CONFLICT",
          "O trabalho atual foi alterado. Atualize e tente novamente.",
          409,
        );
      }
    } else if (production.sessions.length !== 0) {
      throw new ProductionError(
        "PRODUCTION_CONFLICT",
        "Existe uma sessão aberta em um trabalho pausado. Confira os registros.",
        409,
      );
    }

    const changed = await transitionProduction(
      {
        productionId: production.id,
        employeeId: input.employeeId,
        version: production.version,
        from: [production.status],
        status: ProductionStatus.DEFERRED,
      },
      database,
    );

    if (changed.count !== 1) {
      throw new ProductionError(
        "PRODUCTION_CONFLICT",
        "O trabalho anterior foi alterado. Atualize e tente novamente.",
        409,
      );
    }
  }

  // Não conclui produções e não cria comissões.
  // Retornos são tratados igualmente, sem mudar sua classificação.
}