import { EmployeeBreakKind } from "@/lib/generated/prisma/client";
import { readJsonObject, readSessionToken } from "@/lib/auth-http";
import { productionErrorResponse } from "@/lib/production-http";

import { requireAccess } from "@/services/auth.service";
import {
  finishEmployeeBreak,
  getEmployeeBreakOverview,
  startEmployeeBreak,
} from "@/services/employee-break.service";

import { ProductionError } from "@/types/production-error.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown) {
  return Response.json(data, {
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}

function isBreakKind(value: unknown): value is EmployeeBreakKind {
  return (
    value === EmployeeBreakKind.LUNCH ||
    value === EmployeeBreakKind.BATHROOM
  );
}

export async function GET() {
  try {
    const employee = await requireAccess(await readSessionToken());

    return json(await getEmployeeBreakOverview(employee.id));
  } catch (error) {
    return productionErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const employee = await requireAccess(await readSessionToken());
    const body = await readJsonObject(request);

    if (body.action === "start" && isBreakKind(body.kind)) {
      return json(
        await startEmployeeBreak(employee.id, body.kind),
      );
    }

    if (
      body.action === "finish" &&
      typeof body.breakId === "string" &&
      body.breakId.trim()
    ) {
      return json(
        await finishEmployeeBreak(employee.id, body.breakId),
      );
    }

    throw new ProductionError(
      "INVALID_INPUT",
      "Informe uma ação e um intervalo válidos.",
      400,
    );
  } catch (error) {
    return productionErrorResponse(error);
  }
}