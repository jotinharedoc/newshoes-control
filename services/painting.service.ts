import {
  Prisma,
  ProductionStatus,
  SessionEndReason,
  SessionKind,
} from "@/lib/generated/prisma/client";

import {
  createPaintingProduction,
  findPaintingAccess,
  findPaintingForAction,
  findPaintingProductions,
  findStandardPaintingForShoe,
  type PaintingRecord,
} from "@/repositories/painting.repository";

import {
  closeOpenWorkSession,
  createCommissionEntry,
  createWorkSession,
  runProductionTransaction,
  transitionProduction,
  upsertShoe,
} from "@/repositories/production.repository";

import { applyProductionBathroomAction, assertNoOpenEmployeeBreak } from "@/services/employee-break.service";
import { prepareWorkSwitch } from "@/services/work-switch.service";
import { ProductionError } from "@/types/production-error.types";

export type PaintingAction =
  | "pause"
  | "resume"
  | "defer"
  | "continue"
  | "finish";

export type PaintingProductionView = {
  id: string;
  code: string;
  processName: string;
  status: ProductionStatus;
  version: number;
  elapsedMilliseconds: number;
  observedAt: string;
};

export type PaintingOverview = {
  current: PaintingProductionView | null;
  deferred: PaintingProductionView[];
};

async function requirePaintingAccess(
  employeeId: string,
  database?: Prisma.TransactionClient,
) {
  const access = await findPaintingAccess(employeeId, database);

  if (!access) {
    throw new ProductionError(
      "PROCESS_NOT_AUTHORIZED",
      "Você não está autorizado a realizar Pintura.",
      403,
    );
  }

  return access.processType;
}

function toView(
  production: PaintingRecord,
  observedAt: Date,
): PaintingProductionView {
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

export async function getPaintingOverview(
  employeeId: string,
): Promise<PaintingOverview> {
  const process = await requirePaintingAccess(employeeId);

  const productions = await findPaintingProductions(
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

export async function startPaintingProduction(
  employeeId: string,
  shoeCode: string,
) {
  if (typeof shoeCode !== "string") {
    throw new ProductionError(
      "INVALID_INPUT",
      "Informe o código do tênis.",
      400,
    );
  }

  const code = shoeCode.trim();

  if (!/^\d{1,64}$/.test(code)) {
    throw new ProductionError(
      "INVALID_INPUT",
      "Informe um código com 1 a 64 números.",
      400,
    );
  }

  try {
    await runProductionTransaction(async (database) => {
      await assertNoOpenEmployeeBreak(employeeId, database);

      const process = await requirePaintingAccess(
        employeeId,
        database,
      );

      const rule = process.rules[0];

      if (!rule) {
        throw new ProductionError(
          "PROCESS_UNAVAILABLE",
          "A Pintura não possui uma comissão ativa para par completo.",
          409,
        );
      }

      const shoe = await upsertShoe(code, database);

      const existing = await findStandardPaintingForShoe(
        shoe.id,
        process.id,
        database,
      );

      if (existing) {
        throw new ProductionError(
          "SHOE_ALREADY_PROCESSED",
          "Este código já possui uma pintura registrada. Se estiver pendente, retome o registro existente.",
          409,
        );
      }

      const now = new Date();

      // Deixa outros trabalhos do funcionário para depois.
      // A troca e o início são gravados na mesma transação.
      await prepareWorkSwitch(
        {
          employeeId,
          now,
        },
        database,
      );

      await createPaintingProduction(
        {
          employeeId,
          processTypeId: process.id,
          shoeId: shoe.id,
          commissionAmountSnapshot: rule.commissionAmount,
          now,
        },
        database,
      );
    });
  } catch (error) {
    handleDatabaseError(error);
  }

  return getPaintingOverview(employeeId);
}

export async function changePaintingProductionState(
  employeeId: string,
  productionId: string,
  version: number,
  action: PaintingAction,
) {
  const actions: PaintingAction[] = [
    "pause",
    "resume",
    "defer",
    "continue",
    "finish",
  ];

  if (
    typeof productionId !== "string" ||
    !productionId.trim() ||
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
      const process = await requirePaintingAccess(
        employeeId,
        database,
      );

      await assertNoOpenEmployeeBreak(employeeId, database, action === "resume" ? productionId : undefined);

      const production = await findPaintingForAction(
        productionId,
        employeeId,
        process.id,
        database,
      );

      if (!production) {
        throw new ProductionError(
          "PRODUCTION_NOT_FOUND",
          "A pintura não foi encontrada.",
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
      const originalStatus = production.status;

      async function transition(
        allowed: ProductionStatus[],
        status: ProductionStatus,
      ) {
        if (!allowed.includes(originalStatus)) {
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

      if (await applyProductionBathroomAction(employeeId, production, action, database)) return;

      if (action === "resume" || action === "continue") {
        const previousSession =
          production.sessions[production.sessions.length - 1];

        if (
          !previousSession ||
          !previousSession.endedAt ||
          production.sessions.some((session) => !session.endedAt)
        ) {
          throw new ProductionError(
            "PRODUCTION_CONFLICT",
            "As sessões desta produção estão inconsistentes. Atualize e tente novamente.",
            409,
          );
        }

        await prepareWorkSwitch(
          {
            employeeId,
            targetProductionId: production.id,
            now,
          },
          database,
        );

        await transition(
          [
            action === "resume"
              ? ProductionStatus.PAUSED
              : ProductionStatus.DEFERRED,
          ],
          ProductionStatus.IN_PROGRESS,
        );

        // Voltar da pausa não conta como continuação.
        // Retomar um trabalho deixado para depois conta.
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

        if (originalStatus === ProductionStatus.IN_PROGRESS) {
          await closeSession(SessionEndReason.DEFERRED);
        }

        return;
      }

      await transition(
        [ProductionStatus.IN_PROGRESS, ProductionStatus.PAUSED],
        ProductionStatus.COMPLETED,
      );

      if (originalStatus === ProductionStatus.IN_PROGRESS) {
        await closeSession(SessionEndReason.MANUAL_COMPLETION);
      }

      // Usa o valor salvo no início da produção.
      // Somente a conclusão lança a comissão.
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

  return getPaintingOverview(employeeId);
}
