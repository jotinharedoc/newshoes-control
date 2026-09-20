import {
  ProductionStatus,
  SessionEndReason,
  SessionKind,
} from "@/lib/generated/prisma/client";

import {
  createQualityReturn,
  createReturnWorkSession,
  findEmployeeReturns,
  findPendingReturn,
  findReturnCandidates,
  findReturnForAction,
  findReturnProcessAccess,
  findReturnSource,
  type ReturnRecord,
} from "@/repositories/return.repository";

import {
  closeOpenWorkSession,
  runProductionTransaction,
  transitionProduction,
} from "@/repositories/production.repository";

import { assertNoOpenEmployeeBreak } from "@/services/employee-break.service";
import { prepareWorkSwitch } from "@/services/work-switch.service";
import { ProductionError } from "@/types/production-error.types";

export type ReturnAction =
  | "start"
  | "pause"
  | "resume"
  | "defer"
  | "finish";

function toView(record: ReturnRecord, now: Date) {
  const elapsedMilliseconds = record.sessions.reduce(
    (total, session) =>
      total +
      Math.max(
        0,
        (session.endedAt ?? now).getTime() -
          session.startedAt.getTime(),
      ),
    0,
  );

  return {
    id: record.id,
    code: record.shoe.code,
    employeeName: record.employee.name,
    processName: record.processType.name,
    unit: record.unit,
    reason: record.returnReason ?? "",
    sourceProductionId: record.sourceProductionId,
    status: record.status,
    version: record.version,
    hasStarted: record.sessions.length > 0,
    elapsedMilliseconds,
    observedAt: now.toISOString(),
  };
}

export type ReturnProductionView = ReturnType<typeof toView>;

export async function getEmployeeReturns(employeeId: string) {
  const records = await findEmployeeReturns(employeeId);
  const now = new Date();

  return records.map((record) => toView(record, now));
}

export async function getQualityReturnCandidates(code: string) {
  if (typeof code !== "string") {
    throw new ProductionError(
      "INVALID_INPUT",
      "Informe o código do tênis.",
      400,
    );
  }

  const normalized = code.trim();

  if (!/^\d{1,64}$/.test(normalized)) {
    throw new ProductionError(
      "INVALID_INPUT",
      "Informe um código com 1 a 64 números.",
      400,
    );
  }

  return findReturnCandidates(normalized);
}

// A API exige permissão de gerência antes de chamar esta função.
// Solicitar um retorno cria uma pendência, sem interromper o funcionário.
export async function requestQualityReturn(
  sourceProductionId: string,
  reason: string,
) {
  if (
    typeof sourceProductionId !== "string" ||
    typeof reason !== "string"
  ) {
    throw new ProductionError(
      "INVALID_INPUT",
      "Selecione o serviço original e informe o motivo do retorno.",
      400,
    );
  }

  const normalizedReason = reason.trim();

  if (
    !sourceProductionId.trim() ||
    !normalizedReason ||
    normalizedReason.length > 1000
  ) {
    throw new ProductionError(
      "INVALID_INPUT",
      "Selecione o serviço original e informe um motivo de até 1.000 caracteres.",
      400,
    );
  }

  const record = await runProductionTransaction(async (database) => {
    const source = await findReturnSource(
      sourceProductionId,
      database,
    );

    if (!source) {
      throw new ProductionError(
        "PRODUCTION_NOT_FOUND",
        "O serviço original não foi encontrado ou ainda não foi concluído.",
        404,
      );
    }

    const access = await findReturnProcessAccess(
      source.employeeId,
      source.processTypeId,
      database,
    );

    if (!access) {
      throw new ProductionError(
        "PROCESS_NOT_AUTHORIZED",
        "O responsável original está inativo ou não possui mais acesso ao processo.",
        409,
      );
    }

    if (await findPendingReturn(source.id, database)) {
      throw new ProductionError(
        "PRODUCTION_CONFLICT",
        "Este serviço já possui um retorno pendente.",
        409,
      );
    }

    return createQualityReturn(
      {
        source,
        reason: normalizedReason,
        now: new Date(),
      },
      database,
    );
  });

  return toView(record, new Date());
}

export async function changeReturnState(
  employeeId: string,
  productionId: string,
  version: number,
  action: ReturnAction,
) {
  const actions: ReturnAction[] = [
    "start",
    "pause",
    "resume",
    "defer",
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
      "Informe uma produção, uma versão e uma ação válidas.",
      400,
    );
  }

  await runProductionTransaction(async (database) => {
    await assertNoOpenEmployeeBreak(employeeId, database);

    const record = await findReturnForAction(
      productionId,
      employeeId,
      database,
    );

    if (!record) {
      throw new ProductionError(
        "PRODUCTION_NOT_FOUND",
        "O retorno não foi encontrado para este funcionário.",
        404,
      );
    }

    const access = await findReturnProcessAccess(
      employeeId,
      record.processType.id,
      database,
    );

    if (!access) {
      throw new ProductionError(
        "PROCESS_NOT_AUTHORIZED",
        "Você não está autorizado a executar este processo.",
        403,
      );
    }

    if (record.version !== version) {
      throw new ProductionError(
        "PRODUCTION_CONFLICT",
        "O retorno mudou em outra tela. Atualize e tente novamente.",
        409,
      );
    }

    const now = new Date();
    const originalStatus = record.status;

    async function transition(
      allowed: ProductionStatus[],
      status: ProductionStatus,
    ) {
      if (!allowed.includes(originalStatus)) {
        throw new ProductionError(
          "INVALID_PRODUCTION_STATE",
          "Esta ação não é permitida no estado atual do retorno.",
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
          "O retorno foi alterado. Atualize e tente novamente.",
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
          "Não foi encontrada exatamente uma sessão aberta.",
          409,
        );
      }
    }

    if (action === "start" || action === "resume") {
      if (record.sessions.some((session) => !session.endedAt)) {
        throw new ProductionError(
          "PRODUCTION_CONFLICT",
          "Este retorno já possui uma sessão aberta.",
          409,
        );
      }

      if (action === "resume" && record.sessions.length === 0) {
        throw new ProductionError(
          "INVALID_PRODUCTION_STATE",
          "Este retorno ainda não foi iniciado.",
          409,
        );
      }

      // A troca acontece somente quando o funcionário
      // decide iniciar ou retomar este retorno.
      await prepareWorkSwitch(
        {
          employeeId,
          targetProductionId: record.id,
          now,
        },
        database,
      );

      await transition(
        [
          action === "start"
            ? ProductionStatus.DEFERRED
            : ProductionStatus.PAUSED,
        ],
        ProductionStatus.IN_PROGRESS,
      );

      // Um retorno nunca iniciado começa como INITIAL.
      // Voltar da pausa usa RESUME.
      // Voltar de "deixar para depois" usa CONTINUATION.
      const sessionKind =
        record.sessions.length === 0
          ? SessionKind.INITIAL
          : action === "resume"
            ? SessionKind.RESUME
            : SessionKind.CONTINUATION;

      await createReturnWorkSession(
        productionId,
        sessionKind,
        now,
        database,
      );

      return;
    }

    if (action === "pause") {
      await transition(
        [ProductionStatus.IN_PROGRESS],
        ProductionStatus.PAUSED,
      );

      await closeSession(SessionEndReason.PAUSE);
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

    if (record.sessions.length === 0) {
      throw new ProductionError(
        "INVALID_PRODUCTION_STATE",
        "Inicie o retorno antes de concluí-lo.",
        409,
      );
    }

    await transition(
      [ProductionStatus.IN_PROGRESS, ProductionStatus.PAUSED],
      ProductionStatus.COMPLETED,
    );

    if (originalStatus === ProductionStatus.IN_PROGRESS) {
      await closeSession(SessionEndReason.MANUAL_COMPLETION);
    }

    // Retorno não gera comissão adicional.
    // A comissão do serviço original permanece intacta.
  });

  return getEmployeeReturns(employeeId);
}