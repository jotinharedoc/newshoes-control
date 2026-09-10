import { readJsonObject, readSessionToken } from "@/lib/auth-http";
import { productionErrorResponse } from "@/lib/production-http";
import { requireAccess } from "@/services/auth.service";
import {
  changeHygieneProductionState,
  finishAndStartNextHygieneProduction,
  getHygieneOverview,
  startHygieneProduction,
} from "@/services/production.service";
import type { HygieneAction } from "@/types/production.types";

const hygieneActions = new Set<HygieneAction>([
  "pause",
  "resume",
  "defer",
  "continue",
  "finish",
]);

async function authenticatedEmployee() {
  return requireAccess(await readSessionToken());
}

export async function GET() {
  try {
    const employee = await authenticatedEmployee();
    return Response.json(await getHygieneOverview(employee.id));
  } catch (error) {
    return productionErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const employee = await authenticatedEmployee();
    const body = await readJsonObject(request);
    const code = typeof body.code === "string" ? body.code : "";

    if (typeof body.currentProductionId === "string") {
      return Response.json(
        await finishAndStartNextHygieneProduction(
          employee.id,
          body.currentProductionId,
          typeof body.version === "number" ? body.version : Number.NaN,
          code,
        ),
      );
    }

    return Response.json(await startHygieneProduction(employee.id, code));
  } catch (error) {
    return productionErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const employee = await authenticatedEmployee();
    const body = await readJsonObject(request);
    const action = typeof body.action === "string" ? body.action : "";

    if (!hygieneActions.has(action as HygieneAction)) {
      return Response.json(
        { error: { code: "INVALID_INPUT", message: "A ação informada é inválida." } },
        { status: 400 },
      );
    }

    return Response.json(
      await changeHygieneProductionState(
        employee.id,
        typeof body.productionId === "string" ? body.productionId : "",
        typeof body.version === "number" ? body.version : Number.NaN,
        action as HygieneAction,
      ),
    );
  } catch (error) {
    return productionErrorResponse(error);
  }
}

