import { readJsonObject, readSessionToken } from "@/lib/auth-http";
import { administrationError, administrationJson } from "@/lib/administration-http";
import { requireAccess } from "@/services/auth.service";
import { updateAdministrationCommission } from "@/services/administration.service";
import { administrationOptions } from "@/repositories/administration.repository";
import { MANAGEMENT_PERMISSION } from "@/utils/access";
import { AuthError } from "@/types/auth.types";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await requireAccess(await readSessionToken(), MANAGEMENT_PERMISSION);
    return administrationJson((await administrationOptions()).rules);
  } catch (error) { return administrationError(error); }
}
export async function PATCH(request: Request) {
  try {
    const actor = await requireAccess(await readSessionToken(), MANAGEMENT_PERMISSION);
    const body = await readJsonObject(request);
    if (typeof body.id !== "string" || !body.id) throw new AuthError("INVALID_INPUT", "Selecione uma regra.", 400);
    return administrationJson(await updateAdministrationCommission(actor.id, body.id, body.amount));
  } catch (error) { return administrationError(error); }
}
