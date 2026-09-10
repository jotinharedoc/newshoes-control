import { WorkUnit } from "@/lib/generated/prisma/client";

import { readJsonObject, readSessionToken } from "@/lib/auth-http";
import { productionErrorResponse } from "@/lib/production-http";

import { requireAccess } from "@/services/auth.service";
import {
  changeFinalizationProductionState,
  getFinalizationOverview,
  startFinalizationProduction,
  type FinalizationAction,
} from "@/services/finalization.service";

import { ProductionError } from "@/types/production-error.types";

function isWorkUnit(value: unknown): value is WorkUnit {
  return (
    value === WorkUnit.PAIR ||
    value === WorkUnit.LEFT_FOOT ||
    value === WorkUnit.RIGHT_FOOT
  );
}

function isFinalizationAction(
  value: unknown,
): value is FinalizationAction {
  return (
    value === "pause" ||
    value === "resume" ||
    value === "defer" ||
    value === "continue" ||
    value === "finish"
  );
}

async function authenticatedEmployee() {
  const sessionToken = await readSessionToken();

  return requireAccess(sessionToken);
}

export async function GET() {
  try {
    const employee = await authenticatedEmployee();

    const overview = await getFinalizationOverview(employee.id);

    return Response.json(overview);
  } catch (error) {
    return productionErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const employee = await authenticatedEmployee();
    const body = await readJsonObject(request);

    if (typeof body.code !== "string" || !isWorkUnit(body.unit)) {
      throw new ProductionError(
        "INVALID_INPUT",
        "Informe o código e selecione par completo, pé esquerdo ou pé direito.",
        400,
      );
    }

    if (body.kind !== undefined && body.kind !== "STANDARD") {
      throw new ProductionError(
        "INVALID_INPUT",
        "Esta operação inicia somente uma produção normal. Continuações devem retomar o registro existente.",
        400,
      );
    }

    const overview = await startFinalizationProduction(
      employee.id,
      body.code,
      body.unit,
    );

    return Response.json(overview, { status: 201 });
  } catch (error) {
    return productionErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const employee = await authenticatedEmployee();
    const body = await readJsonObject(request);

    if (
      typeof body.productionId !== "string" ||
      !body.productionId.trim() ||
      typeof body.version !== "number" ||
      !Number.isInteger(body.version) ||
      body.version < 0 ||
      !isFinalizationAction(body.action)
    ) {
      throw new ProductionError(
        "INVALID_INPUT",
        "Informe uma produção, uma versão e uma ação válidas.",
        400,
      );
    }

    const overview = await changeFinalizationProductionState(
      employee.id,
      body.productionId,
      body.version,
      body.action,
    );

    return Response.json(overview);
  } catch (error) {
    return productionErrorResponse(error);
  }
}