import { readJsonObject, readSessionToken } from "@/lib/auth-http";
import { productionErrorResponse } from "@/lib/production-http";

import { requireAccess } from "@/services/auth.service";
import {
  changePaintingProductionState,
  getPaintingOverview,
  startPaintingProduction,
  type PaintingAction,
} from "@/services/painting.service";

import { ProductionError } from "@/types/production-error.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isPaintingAction(value: unknown): value is PaintingAction {
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
    const overview = await getPaintingOverview(employee.id);

    return Response.json(overview, {
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return productionErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const employee = await authenticatedEmployee();
    const body = await readJsonObject(request);

    if (typeof body.code !== "string" || !body.code.trim()) {
      throw new ProductionError(
        "INVALID_INPUT",
        "Informe o código do tênis.",
        400,
      );
    }

    if (body.kind !== undefined && body.kind !== "STANDARD") {
      throw new ProductionError(
        "INVALID_INPUT",
        "Esta operação inicia somente uma pintura normal. O retorno de qualidade utiliza um fluxo separado.",
        400,
      );
    }

    if (body.unit !== undefined && body.unit !== "PAIR") {
      throw new ProductionError(
        "INVALID_INPUT",
        "A pintura deve ser registrada como par completo.",
        400,
      );
    }

    const overview = await startPaintingProduction(
      employee.id,
      body.code,
    );

    return Response.json(overview, {
      status: 201,
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
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
      !isPaintingAction(body.action)
    ) {
      throw new ProductionError(
        "INVALID_INPUT",
        "Informe uma produção, uma versão e uma ação válidas.",
        400,
      );
    }

    const overview = await changePaintingProductionState(
      employee.id,
      body.productionId,
      body.version,
      body.action,
    );

    return Response.json(overview, {
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return productionErrorResponse(error);
  }
}