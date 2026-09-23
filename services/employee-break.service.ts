import {
  EmployeeBreakKind,
  Prisma,
  ProductionStatus,
  SessionEndReason,
  SessionKind,
} from "@/lib/generated/prisma/client";

import {
  closeEmployeeBreak,
  createEmployeeBreak,
  findBreakProduction,
  findBreakProductionAccess,
  findEmployeeBreakProductions,
  findOpenEmployeeBreak,
  findOperationalBreakEmployee,
} from "@/repositories/employee-break.repository";

import {
  closeOpenWorkSession,
  createWorkSession,
  runProductionTransaction,
  transitionProduction,
} from "@/repositories/production.repository";

import { ProductionError } from "@/types/production-error.types";

function conflict(message: string): never {
  throw new ProductionError(
    "PRODUCTION_CONFLICT",
    message,
    409,
  );
}

function handleDatabaseError(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034")
  ) {
    conflict(
      "Outra operação alterou o trabalho ou o intervalo. Atualize antes de tentar novamente.",
    );
  }

  throw error;
}

// Será usada pelos serviços de produção para bloquear
// trabalho tanto no almoço quanto no banheiro.
export async function assertNoOpenEmployeeBreak(
  employeeId: string,
  database: Prisma.TransactionClient,
  resumingProductionId?: string,
) {
  const current = await findOpenEmployeeBreak(employeeId, database);

  const resumingBathroom = current?.kind === EmployeeBreakKind.BATHROOM &&
    current.pausedProductionId === resumingProductionId;

  if (current && !resumingBathroom) {
    throw new ProductionError(
      "INVALID_PRODUCTION_STATE",
      "Encerre o intervalo antes de iniciar ou retomar um trabalho.",
      409,
    );
  }
}

export async function getEmployeeBreakOverview(
  employeeId: string,
  database?: Prisma.TransactionClient,
) {
  const current = await findOpenEmployeeBreak(employeeId, database);

  return {
    current: current
      ? {
          id: current.id,
          kind: current.kind,
          startedAt: current.startedAt.toISOString(),
          pausedProductionId: current.pausedProductionId,
        }
      : null,
    observedAt: new Date().toISOString(),
  };
}

export type EmployeeBreakOverview = Awaited<
  ReturnType<typeof getEmployeeBreakOverview>
>;

function runBreakTransaction<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  database?: Prisma.TransactionClient,
) {
  return database ? operation(database) : runProductionTransaction(operation);
}

// Compatibilidade com as ações pause/resume das APIs de produção.
// O chamador valida proprietário, processo e versão dentro da mesma transação.
export async function applyProductionBathroomAction(
  employeeId: string,
  production: { id: string; status: ProductionStatus },
  action: string,
  database: Prisma.TransactionClient,
) {
  if (action === "pause") {
    if (production.status !== ProductionStatus.IN_PROGRESS) {
      throw new ProductionError(
        "INVALID_PRODUCTION_STATE",
        "Só é possível pausar um trabalho em andamento.",
        409,
      );
    }
    await startEmployeeBreak(employeeId, EmployeeBreakKind.BATHROOM, database);
    return true;
  }

  if (action === "resume") {
    const current = await findOpenEmployeeBreak(employeeId, database);
    if (current?.kind === EmployeeBreakKind.BATHROOM &&
        current.pausedProductionId === production.id) {
      await finishEmployeeBreak(employeeId, current.id, database);
      return true;
    }
  }

  // Uma pausa anterior à adoção de EmployeeBreak pode ser retomada,
  // sem inventar retroativamente um intervalo que não foi registrado.
  return false;
}

export async function startEmployeeBreak(
  employeeId: string,
  kind: EmployeeBreakKind,
  transaction?: Prisma.TransactionClient,
) {
  if (
    kind !== EmployeeBreakKind.LUNCH &&
    kind !== EmployeeBreakKind.BATHROOM
  ) {
    throw new ProductionError(
      "INVALID_INPUT",
      "Selecione almoço ou banheiro.",
      400,
    );
  }

  try {
    await runBreakTransaction(async (database) => {
      if (!(await findOperationalBreakEmployee(employeeId, database))) {
        throw new ProductionError("PROCESS_NOT_AUTHORIZED", "Perfis de gerência não podem iniciar intervalos operacionais.", 403);
      }
      await assertNoOpenEmployeeBreak(employeeId, database);

      const productions = await findEmployeeBreakProductions(
        employeeId,
        database,
      );

      if (productions.length > 1) {
        conflict(
          "Há mais de um trabalho ativo ou pausado. Confira os registros antes de iniciar o intervalo.",
        );
      }

      const production = productions[0] ?? null;
      const now = new Date();

      // Banheiro só retoma automaticamente o que este intervalo pausou.
      // Se o trabalho já estava pausado, ele permanece pausado ao voltar.
      const shouldLinkProduction =
        production !== null &&
        (kind === EmployeeBreakKind.LUNCH ||
          production.status === ProductionStatus.IN_PROGRESS);

      if (production) {
        if (production.status === ProductionStatus.IN_PROGRESS) {
          const closed = await closeOpenWorkSession(
            production.id,
            now,
            kind === EmployeeBreakKind.LUNCH
              ? SessionEndReason.LUNCH
              : SessionEndReason.PAUSE,
            database,
          );

          if (closed.count !== 1) {
            conflict(
              "Não foi encontrada exatamente uma sessão de trabalho aberta.",
            );
          }
        }

        const changed = await transitionProduction(
          {
            productionId: production.id,
            employeeId,
            version: production.version,
            from: [production.status],
            status:
              kind === EmployeeBreakKind.LUNCH
                ? ProductionStatus.DEFERRED
                : ProductionStatus.PAUSED,
          },
          database,
        );

        if (changed.count !== 1) {
          conflict("O trabalho mudou. Atualize e tente novamente.");
        }
      }

      await createEmployeeBreak(
        employeeId,
        kind,
        shouldLinkProduction ? production!.id : null,
        now,
        database,
      );
    }, transaction);
  } catch (error) {
    handleDatabaseError(error);
  }

  return getEmployeeBreakOverview(employeeId, transaction);
}

export async function finishEmployeeBreak(
  employeeId: string,
  breakId: string,
  transaction?: Prisma.TransactionClient,
) {
  if (typeof breakId !== "string" || !breakId.trim()) {
    throw new ProductionError(
      "INVALID_INPUT",
      "Informe o registro do intervalo.",
      400,
    );
  }

  try {
    await runBreakTransaction(async (database) => {
      const current = await findOpenEmployeeBreak(
        employeeId,
        database,
      );

      if (!current || current.id !== breakId) {
        conflict(
          "Este intervalo já foi encerrado ou não está mais aberto. Atualize a tela.",
        );
      }

      const now = new Date();

      if (
        current.kind === EmployeeBreakKind.BATHROOM &&
        current.pausedProductionId
      ) {
        const production = await findBreakProduction(
          current.pausedProductionId,
          employeeId,
          database,
        );

        if (!production) {
          conflict("O trabalho vinculado ao intervalo não foi encontrado.");
        }

        if (
          production.status !== ProductionStatus.PAUSED ||
          production.sessions.length > 0
        ) {
          conflict(
            "O trabalho foi alterado durante o intervalo. Confira os registros antes de voltar.",
          );
        }

        const blocking = await findEmployeeBreakProductions(
          employeeId,
          database,
        );

        if (blocking.some((item) => item.id !== production.id)) {
          conflict(
            "Outro trabalho está ativo. Confira os registros antes de voltar.",
          );
        }

        const access = await findBreakProductionAccess(
          employeeId,
          production.processTypeId,
          database,
        );

        // Se a permissão mudou, encerra o intervalo,
        // mas não retoma um processo sem autorização.
        if (access) {
          const changed = await transitionProduction(
            {
              productionId: production.id,
              employeeId,
              version: production.version,
              from: [ProductionStatus.PAUSED],
              status: ProductionStatus.IN_PROGRESS,
            },
            database,
          );

          if (changed.count !== 1) {
            conflict("O trabalho mudou. Atualize e tente novamente.");
          }

          await createWorkSession(
            production.id,
            SessionKind.RESUME,
            now,
            database,
          );
        }
      }

      const closed = await closeEmployeeBreak(
        current.id,
        employeeId,
        now,
        database,
      );

      if (closed.count !== 1) {
        conflict("O intervalo mudou. Atualize e tente novamente.");
      }

      // Almoço: o trabalho permanece DEFERRED.
      // Sem trabalho vinculado: encerra somente o intervalo.
      // Nenhum intervalo cria ou altera comissão.
    }, transaction);
  } catch (error) {
    handleDatabaseError(error);
  }

  return getEmployeeBreakOverview(employeeId, transaction);
}
