import { readJsonObject, readSessionToken } from "@/lib/auth-http";
import { productionErrorResponse } from "@/lib/production-http";

import { requireAccess } from "@/services/auth.service";
import {
  finishLunch,
  getLunchOverview,
  startLunch,
} from "@/services/lunch.service";

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

export async function GET() {
  try {
    const employee = await requireAccess(await readSessionToken());

    return json(await getLunchOverview(employee.id));
  } catch (error) {
    return productionErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const employee = await requireAccess(await readSessionToken());
    const body = await readJsonObject(request);

    if (body.action === "start") {
      return json(await startLunch(employee.id));
    }

    if (
      body.action === "finish" &&
      typeof body.lunchId === "string" &&
      body.lunchId.trim()
    ) {
      return json(await finishLunch(employee.id, body.lunchId));
    }

    throw new ProductionError(
      "INVALID_INPUT",
      "Informe uma ação de almoço válida.",
      400,
    );
  } catch (error) {
    return productionErrorResponse(error);
  }
}