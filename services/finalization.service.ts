import {
  Prisma,
  ProductionStatus,
  SessionEndReason,
  SessionKind,
  WorkUnit,
} from "@/lib/generated/prisma/client";

import {
  createFinalizationProduction,
  findFinalizationAccess,
  findFinalizationForAction,
  findFinalizationProductions,
  findStandardFinalizationsForShoe,
  type FinalizationRecord,
} from "@/repositories/finalization.repository";

import {
  closeOpenWorkSession,
  createCommissionEntry,
  createWorkSession,
  findBlockingProduction,
  runProductionTransaction,
  transitionProduction,
  upsertShoe,
} from "@/repositories/production.repository";

import { ProductionError } from "@/types/production-error.types";

export type FinalizationAction =
  | "pause"
  | "resume"
  | "defer"
  | "continue"
  | "finish";

export type FinalizationProductionView = {
  id: string;
  code: string;
  processName: string;
  unit: WorkUnit;
  status: ProductionStatus;
  version: number;
  elapsedMilliseconds: number;
  observedAt: string;
};

export type FinalizationOverview = {
  current: FinalizationProductionView | null;
  deferred: FinalizationProductionView[];
};

async function requireFinalizationAccess(
  employeeId: string,
  database?: Prisma.TransactionClient,
) {
  const access = await findFinalizationAccess(employeeId, database);

  if (!access) {
    throw new ProductionError(
      "PROCESS_NOT_AUTHORIZED",
      "Você não está autorizado a realizar Finalização.",
      403,
    );
  }

  return access.processType;
}

function toView(
  production: FinalizationRecord,
  observedAt: Date,
): FinalizationProductionView {
  const elapsedMilliseconds = production.sessions.reduce(
    (total, session) => {
      const end = session.endedAt ?? observedAt;

      return (
        total +
        Math.max(0, end.getTime() - session.startedAt.getTime())
      );
    },
    0,
  );

  return {
    id: production.id,
    code: production.shoe.code,
    processName: production.processType.name,
    unit: production.unit,
    status: production.status,
    version: production.version,
    elapsedMilliseconds,
    observedAt: observedAt.toISOString(),
  };
}

function handleDatabaseError(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034")
  ) {
    throw new ProductionError(
      "PRODUCTION_CONFLICT",
      "Outro registro alterou esta produção. Atualize e tente novamente.",
      409,
    );
  }

  throw error;
}

export async function getFinalizationOverview(
  employeeId: string,
): Promise<FinalizationOverview> {
  const process = await requireFinalizationAccess(employeeId);

  const productions = await findFinalizationProductions(
    employeeId,
    process.id,
  );

  const observedAt = new Date();

  const current = productions.find(
    (production) =>
      production.status === ProductionStatus.IN_PROGRESS ||
      production.status === ProductionStatus.PAUSED,
  );

  return {
    current: current ? toView(current, observedAt) : null,
    deferred: productions
      .filter(
        (production) =>
          production.status === ProductionStatus.DEFERRED,
      )
      .map((production) => toView(production, observedAt)),
  };
}

export async function startFinalizationProduction(
  employeeId: string,
  shoeCode: string,
  unit: WorkUnit,
) {
  const code = shoeCode.trim();

  if (!/^\d{1,64}$/.test(code)) {
    throw new ProductionError(
      "INVALID_INPUT",
      "Informe um código com 1 a 64 números.",
      400,
    );
  }

  if (!Object.values(WorkUnit).includes(unit)) {
    throw new ProductionError(
      "INVALID_INPUT",
      "Selecione par completo, pé esquerdo ou pé direito.",
      400,
    );
  }

  try {
    await runProductionTransaction(async (database) => {
      const process = await requireFinalizationAccess(
        employeeId,
        database,
      );

      const rule = process.rules.find(
        (entry) => entry.unit === unit,
      );

      if (!rule) {
        throw new ProductionError(
          "PROCESS_UNAVAILABLE",
          "Não existe uma comissão ativa para essa parte do tênis.",
          409,
        );
      }

      if (await findBlockingProduction(employeeId, database)) {
        throw new ProductionError(
          "ACTIVE_PRODUCTION_EXISTS",
          "Finalize ou deixe a produção atual para depois antes de iniciar outra.",
          409,
        );
      }

      const shoe = await upsertShoe(code, database);

      const existing = await findStandardFinalizationsForShoe(
        shoe.id,
        process.id,
        database,
      );

      const hasConflict = existing.some(
        (production) =>
          unit === WorkUnit.PAIR ||
          production.unit === WorkUnit.PAIR ||
          production.unit === unit,
      );

      if (hasConflict) {
        throw new ProductionError(
          "SHOE_ALREADY_PROCESSED",
          "Essa parte já possui uma finalização registrada. Se estiver pendente, continue o registro existente.",
          409,
        );
      }

      await createFinalizationProduction(
        {
          employeeId,
          processTypeId: process.id,
          shoeId: shoe.id,
          unit,
          commissionAmountSnapshot: rule.commissionAmount,
          now: new Date(),
        },
        database,
      );
    });
  } catch (error) {
    handleDatabaseError(error);
  }

  return getFinalizationOverview(employeeId);
}

export async function changeFinalizationProductionState(
  employeeId: string,
  productionId: string,
  version: number,
  action: FinalizationAction,
) {
  const actions: FinalizationAction[] = [
    "pause",
    "resume",
    "defer",
    "continue",
    "finish",
  ];

  if (
    !productionId ||
    !Number.isInteger(version) ||
    version < 0 ||
    !actions.includes(action)
  ) {
    throw new ProductionError(
      "INVALID_INPUT",
      "A ação ou os dados da produção são inválidos.",
      400,
    );
  }

  try {
    await runProductionTransaction(async (database) => {
      const process = await requireFinalizationAccess(
        employeeId,
        database,
      );

      const production = await findFinalizationForAction(
        productionId,
        employeeId,
        process.id,
        database,
      );

      if (!production) {
        throw new ProductionError(
          "PRODUCTION_NOT_FOUND",
          "A finalização não foi encontrada.",
          404,
        );
      }

      if (production.version !== version) {
        throw new ProductionError(
          "PRODUCTION_CONFLICT",
          "Essa produção mudou em outra tela. Atualize e tente novamente.",
          409,
        );
      }

      const now = new Date();

      async function transition(
        allowed: ProductionStatus[],
        status: ProductionStatus,
      ) {
        if (!allowed.includes(production!.status)) {
          throw new ProductionError(
            "INVALID_PRODUCTION_STATE",
            "Essa ação não é permitida no estado atual da produção.",
            409,
          );
        }

        const result = await transitionProduction(
          {
            productionId,
            employeeId,
            version,
            from: allowed,
            status,
            ...(status === ProductionStatus.COMPLETED
              ? { completedAt: now }
              : {}),
          },
          database,
        );

        if (result.count !== 1) {
          throw new ProductionError(
            "PRODUCTION_CONFLICT",
            "A produção foi alterada. Atualize e tente novamente.",
            409,
          );
        }
      }

      async function closeSession(reason: SessionEndReason) {
        const result = await closeOpenWorkSession(
          productionId,
          now,
          reason,
          database,
        );

        if (result.count !== 1) {
          throw new ProductionError(
            "PRODUCTION_CONFLICT",
            "Não foi encontrada exatamente uma sessão de trabalho aberta.",
            409,
          );
        }
      }

      if (action === "pause") {
        await transition(
          [ProductionStatus.IN_PROGRESS],
          ProductionStatus.PAUSED,
        );

        await closeSession(SessionEndReason.PAUSE);
        return;
      }

      if (action === "resume" || action === "continue") {
        if (
          action === "continue" &&
          (await findBlockingProduction(employeeId, database))
        ) {
          throw new ProductionError(
            "ACTIVE_PRODUCTION_EXISTS",
            "Finalize ou deixe a produção atual para depois antes de continuar esta.",
            409,
          );
        }

        await transition(
          [
            action === "resume"
              ? ProductionStatus.PAUSED
              : ProductionStatus.DEFERRED,
          ],
          ProductionStatus.IN_PROGRESS,
        );

        await createWorkSession(
          productionId,
          action === "resume"
            ? SessionKind.RESUME
            : SessionKind.CONTINUATION,
          now,
          database,
        );

        return;
      }

      if (action === "defer") {
        await transition(
          [ProductionStatus.IN_PROGRESS, ProductionStatus.PAUSED],
          ProductionStatus.DEFERRED,
        );

        if (production.status === ProductionStatus.IN_PROGRESS) {
          await closeSession(SessionEndReason.DEFERRED);
        }

        return;
      }

      await transition(
        [ProductionStatus.IN_PROGRESS, ProductionStatus.PAUSED],
        ProductionStatus.COMPLETED,
      );

      if (production.status === ProductionStatus.IN_PROGRESS) {
        await closeSession(SessionEndReason.MANUAL_COMPLETION);
      }

      await createCommissionEntry(
        productionId,
        production.commissionAmountSnapshot,
        now,
        database,
      );
    });
  } catch (error) {
    handleDatabaseError(error);
  }

  return getFinalizationOverview(employeeId);
}