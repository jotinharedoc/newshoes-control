import {
  Prisma,
  ProductionStatus,
  SessionEndReason,
  SessionKind,
} from "@/lib/generated/prisma/client";
import {
  closeOpenWorkSession,
  createCommissionEntry,
  createHygieneProduction,
  createWorkSession,
  findBlockingProduction,
  findHygieneAccess,
  findHygieneProductionForAction,
  findHygieneProductions,
  findStandardHygieneForShoe,
  runProductionTransaction,
  transitionProduction,
  upsertShoe,
  type ProductionViewRecord,
} from "@/repositories/production.repository";
import { ProductionError } from "@/types/production-error.types";
import type {
  HygieneAction,
  HygieneOverview,
  HygieneProductionView,
} from "@/types/production.types";

function normalizeShoeCode(value: string) {
  const code = value.trim();

  if (!/^\d{4,10}$/.test(code)) {
    throw new ProductionError(
      "INVALID_INPUT",
      "Informe um código com 4 a 10 números.",
      400,
    );
  }

  return code;
}

function assertVersion(version: number) {
  if (!Number.isInteger(version) || version < 0) {
    throw new ProductionError(
      "INVALID_INPUT",
      "A versão da produção é inválida. Atualize a página e tente novamente.",
      400,
    );
  }
}

async function requireHygieneAccess(
  employeeId: string,
  database?: Prisma.TransactionClient,
) {
  const access = await findHygieneAccess(employeeId, database);

  if (!access) {
    throw new ProductionError(
      "PROCESS_NOT_AUTHORIZED",
      "Você não está autorizado a realizar Higienização.",
      403,
    );
  }

  const rule = access.processType.rules[0];

  if (!rule) {
    throw new ProductionError(
      "PROCESS_UNAVAILABLE",
      "A Higienização não possui uma regra ativa para par completo.",
      409,
    );
  }

  return { processType: access.processType, rule };
}

function toProductionView(
  production: ProductionViewRecord,
  observedAt: Date,
): HygieneProductionView {
  const elapsedMilliseconds = production.sessions.reduce((total, session) => {
    const end = session.endedAt ?? observedAt;
    return total + Math.max(0, end.getTime() - session.startedAt.getTime());
  }, 0);

  return {
    id: production.id,
    code: production.shoe.code,
    processName: production.processType.name,
    status: production.status as HygieneProductionView["status"],
    version: production.version,
    startedAt: production.startedAt.toISOString(),
    elapsedMilliseconds,
    observedAt: observedAt.toISOString(),
  };
}

export async function getHygieneOverview(
  employeeId: string,
): Promise<HygieneOverview> {
  const { processType } = await requireHygieneAccess(employeeId);
  const productions = await findHygieneProductions(employeeId, processType.id);
  const observedAt = new Date();
  const currentRecord = productions.find(
    (production) =>
      production.status === ProductionStatus.IN_PROGRESS ||
      production.status === ProductionStatus.PAUSED,
  );

  return {
    current: currentRecord ? toProductionView(currentRecord, observedAt) : null,
    deferred: productions
      .filter((production) => production.status === ProductionStatus.DEFERRED)
      .map((production) => toProductionView(production, observedAt)),
  };
}

async function createProductionInsideTransaction(
  employeeId: string,
  code: string,
  database: Prisma.TransactionClient,
) {
  const { processType, rule } = await requireHygieneAccess(employeeId, database);
  const shoe = await upsertShoe(code, database);
  const existing = await findStandardHygieneForShoe(
    shoe.id,
    processType.id,
    database,
  );

  if (existing) {
    throw new ProductionError(
      "SHOE_ALREADY_PROCESSED",
      "Este código já possui uma Higienização registrada.",
      409,
    );
  }

  return createHygieneProduction(
    {
      employeeId,
      processTypeId: processType.id,
      shoeId: shoe.id,
      commissionAmountSnapshot: rule.commissionAmount,
      now: new Date(),
    },
    database,
  );
}

function mapDatabaseConflict(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034")
  ) {
    throw new ProductionError(
      "PRODUCTION_CONFLICT",
      "A produção mudou enquanto você realizava a ação. Atualize e tente novamente.",
      409,
    );
  }

  throw error;
}

export async function startHygieneProduction(
  employeeId: string,
  shoeCode: string,
) {
  const code = normalizeShoeCode(shoeCode);

  try {
    await runProductionTransaction(async (database) => {
      if (await findBlockingProduction(employeeId, database)) {
        throw new ProductionError(
          "ACTIVE_PRODUCTION_EXISTS",
          "Pause ou deixe a produção atual para depois antes de iniciar outra.",
          409,
        );
      }

      await createProductionInsideTransaction(employeeId, code, database);
    });
  } catch (error) {
    mapDatabaseConflict(error);
  }

  return getHygieneOverview(employeeId);
}

async function requireProductionForAction(
  employeeId: string,
  productionId: string,
  database: Prisma.TransactionClient,
) {
  await requireHygieneAccess(employeeId, database);
  const production = await findHygieneProductionForAction(
    productionId,
    employeeId,
    database,
  );

  if (!production) {
    throw new ProductionError(
      "PRODUCTION_NOT_FOUND",
      "A produção não foi encontrada.",
      404,
    );
  }

  return production;
}

function assertStatus(
  status: ProductionStatus,
  allowed: ProductionStatus[],
) {
  if (!allowed.includes(status)) {
    throw new ProductionError(
      "INVALID_PRODUCTION_STATE",
      "Esta ação não é permitida no estado atual da produção.",
      409,
    );
  }
}

async function assertTransitionSucceeded(result: { count: number }) {
  if (result.count !== 1) {
    throw new ProductionError(
      "PRODUCTION_CONFLICT",
      "A produção foi alterada em outra tela. Atualize e tente novamente.",
      409,
    );
  }
}

export async function changeHygieneProductionState(
  employeeId: string,
  productionId: string,
  version: number,
  action: HygieneAction,
) {
  assertVersion(version);

  try {
    await runProductionTransaction(async (database) => {
      const production = await requireProductionForAction(
        employeeId,
        productionId,
        database,
      );
      const now = new Date();

      if (production.version !== version) {
        throw new ProductionError(
          "PRODUCTION_CONFLICT",
          "A produção foi alterada em outra tela. Atualize e tente novamente.",
          409,
        );
      }

      if (action === "pause") {
        assertStatus(production.status, [ProductionStatus.IN_PROGRESS]);
        const closed = await closeOpenWorkSession(
          production.id,
          now,
          SessionEndReason.PAUSE,
          database,
        );
        if (closed.count !== 1) {
          throw new ProductionError("PRODUCTION_CONFLICT", "A sessão de trabalho não está aberta.", 409);
        }
        await assertTransitionSucceeded(
          await transitionProduction(
            {
              productionId,
              employeeId,
              version,
              from: [ProductionStatus.IN_PROGRESS],
              status: ProductionStatus.PAUSED,
            },
            database,
          ),
        );
        return;
      }

      if (action === "resume" || action === "continue") {
        const expectedStatus =
          action === "resume" ? ProductionStatus.PAUSED : ProductionStatus.DEFERRED;
        assertStatus(production.status, [expectedStatus]);

        if (action === "continue" && (await findBlockingProduction(employeeId, database))) {
          throw new ProductionError(
            "ACTIVE_PRODUCTION_EXISTS",
            "Finalize ou deixe a produção atual para depois antes de continuar esta.",
            409,
          );
        }

        await assertTransitionSucceeded(
          await transitionProduction(
            {
              productionId,
              employeeId,
              version,
              from: [expectedStatus],
              status: ProductionStatus.IN_PROGRESS,
            },
            database,
          ),
        );
        await createWorkSession(
          production.id,
          action === "resume" ? SessionKind.RESUME : SessionKind.CONTINUATION,
          now,
          database,
        );
        return;
      }

      if (action === "defer") {
        assertStatus(production.status, [
          ProductionStatus.IN_PROGRESS,
          ProductionStatus.PAUSED,
        ]);
        if (production.status === ProductionStatus.IN_PROGRESS) {
          const closed = await closeOpenWorkSession(
            production.id,
            now,
            SessionEndReason.DEFERRED,
            database,
          );
          if (closed.count !== 1) {
            throw new ProductionError("PRODUCTION_CONFLICT", "A sessão de trabalho não está aberta.", 409);
          }
        }
        await assertTransitionSucceeded(
          await transitionProduction(
            {
              productionId,
              employeeId,
              version,
              from: [ProductionStatus.IN_PROGRESS, ProductionStatus.PAUSED],
              status: ProductionStatus.DEFERRED,
            },
            database,
          ),
        );
        return;
      }

      assertStatus(production.status, [
        ProductionStatus.IN_PROGRESS,
        ProductionStatus.PAUSED,
      ]);
      if (production.status === ProductionStatus.IN_PROGRESS) {
        const closed = await closeOpenWorkSession(
          production.id,
          now,
          SessionEndReason.MANUAL_COMPLETION,
          database,
        );
        if (closed.count !== 1) {
          throw new ProductionError("PRODUCTION_CONFLICT", "A sessão de trabalho não está aberta.", 409);
        }
      }
      await assertTransitionSucceeded(
        await transitionProduction(
          {
            productionId,
            employeeId,
            version,
            from: [ProductionStatus.IN_PROGRESS, ProductionStatus.PAUSED],
            status: ProductionStatus.COMPLETED,
            completedAt: now,
          },
          database,
        ),
      );
      await createCommissionEntry(
        production.id,
        production.commissionAmountSnapshot,
        now,
        database,
      );
    });
  } catch (error) {
    mapDatabaseConflict(error);
  }

  return getHygieneOverview(employeeId);
}

export async function finishAndStartNextHygieneProduction(
  employeeId: string,
  productionId: string,
  version: number,
  nextShoeCode: string,
) {
  assertVersion(version);
  const code = normalizeShoeCode(nextShoeCode);

  try {
    await runProductionTransaction(async (database) => {
      const production = await requireProductionForAction(
        employeeId,
        productionId,
        database,
      );
      assertStatus(production.status, [
        ProductionStatus.IN_PROGRESS,
        ProductionStatus.PAUSED,
      ]);
      if (production.version !== version) {
        throw new ProductionError("PRODUCTION_CONFLICT", "A produção foi alterada em outra tela.", 409);
      }
      if (production.shoe.code === code) {
        throw new ProductionError("INVALID_INPUT", "Informe o código do próximo tênis.", 400);
      }

      const now = new Date();
      if (production.status === ProductionStatus.IN_PROGRESS) {
        const closed = await closeOpenWorkSession(
          production.id,
          now,
          SessionEndReason.NEXT_QR_SCAN,
          database,
        );
        if (closed.count !== 1) {
          throw new ProductionError("PRODUCTION_CONFLICT", "A sessão de trabalho não está aberta.", 409);
        }
      }
      await assertTransitionSucceeded(
        await transitionProduction(
          {
            productionId,
            employeeId,
            version,
            from: [ProductionStatus.IN_PROGRESS, ProductionStatus.PAUSED],
            status: ProductionStatus.COMPLETED,
            completedAt: now,
          },
          database,
        ),
      );
      await createCommissionEntry(
        production.id,
        production.commissionAmountSnapshot,
        now,
        database,
      );
      await createProductionInsideTransaction(employeeId, code, database);
    });
  } catch (error) {
    mapDatabaseConflict(error);
  }

  return getHygieneOverview(employeeId);
}

