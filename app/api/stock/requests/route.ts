import { readJsonObject, readSessionToken } from "@/lib/auth-http";
import { administrationError, administrationJson } from "@/lib/administration-http";
import { requireAccess } from "@/services/auth.service";
import { createStockRequest, changeStockRequestStatus, listStockRequests } from "@/services/stock.service";
import { AuthError } from "@/types/auth.types";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const actor = await requireAccess(await readSessionToken());
    const params = new URL(request.url).searchParams;
    return administrationJson(await listStockRequests(actor.id, { status: params.get("status") || undefined, cursor: params.get("cursor") || undefined }));
  } catch (error) { return administrationError(error); }
}
export async function POST(request: Request) {
  try {
    const actor = await requireAccess(await readSessionToken());
    return administrationJson(await createStockRequest(actor.id, await readJsonObject(request)));
  } catch (error) { return administrationError(error); }
}
export async function PATCH(request: Request) {
  try {
    const actor = await requireAccess(await readSessionToken());
    const body = await readJsonObject(request);
    if (typeof body.id !== "string" || !body.id) throw new AuthError("INVALID_INPUT", "Selecione uma solicitação.", 400);
    return administrationJson(await changeStockRequestStatus(actor.id, body.id, body.status));
  } catch (error) { return administrationError(error); }
}
