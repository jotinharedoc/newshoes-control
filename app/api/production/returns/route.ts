import { Prisma } from "@/lib/generated/prisma/client";
import { readJsonObject, readSessionToken } from "@/lib/auth-http";
import { productionErrorResponse } from "@/lib/production-http";

import { requireAccess } from "@/services/auth.service";
import {
  changeReturnState,
  getEmployeeReturns,
  getQualityReturnCandidates,
  requestQualityReturn,
  type ReturnAction,
} from "@/services/return.service";

import { ProductionError } from "@/types/production-error.types";
import { MANAGEMENT_PERMISSION } from "@/utils/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}

function handleError(error: unknown) {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034")
  ) {
    return productionErrorResponse(
      new ProductionError(
        "PRODUCTION_CONFLICT",
        "Outra operação alterou os registros. Atualize antes de tentar novamente.",
        409,
      ),
    );
  }

  return productionErrorResponse(error);
}

function isReturnAction(value: unknown): value is ReturnAction {
  return (
    value === "start" ||
    value === "pause" ||
    value === "resume" ||
    value === "defer" ||
    value === "finish"
  );
}

export async function GET(request: Request) {
  try {
    const token = await readSessionToken();
    const params = new URL(request.url).searchParams;
    const code = params.get("code");

    // Busca de serviços originais: somente gerência.
    if (code !== null) {
      await requireAccess(token, MANAGEMENT_PERMISSION);

      return json(await getQualityReturnCandidates(code));
    }

    // Funcionário consulta somente os próprios retornos.
    const employee = await requireAccess(token);

    return json(await getEmployeeReturns(employee.id));
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const token = await readSessionToken();

    await requireAccess(token, MANAGEMENT_PERMISSION);

    const body = await readJsonObject(request);

    if (
      typeof body.sourceProductionId !== "string" ||
      typeof body.reason !== "string"
    ) {
      throw new ProductionError(
        "INVALID_INPUT",
        "Selecione o serviço original e informe o motivo do retorno.",
        400,
      );
    }

    const result = await requestQualityReturn(
      body.sourceProductionId,
      body.reason,
    );

    return json(result, 201);
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const token = await readSessionToken();
    const employee = await requireAccess(token);
    const body = await readJsonObject(request);

    if (
      typeof body.productionId !== "string" ||
      !body.productionId.trim() ||
      typeof body.version !== "number" ||
      !Number.isInteger(body.version) ||
      body.version < 0 ||
      !isReturnAction(body.action)
    ) {
      throw new ProductionError(
        "INVALID_INPUT",
        "Informe um retorno, uma versão e uma ação válidas.",
        400,
      );
    }

    const result = await changeReturnState(
      employee.id,
      body.productionId,
      body.version,
      body.action,
    );

    return json(result);
  } catch (error) {
    return handleError(error);
  }
}