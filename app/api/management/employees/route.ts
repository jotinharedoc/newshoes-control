import { readJsonObject, readSessionToken } from "@/lib/auth-http";
import { administrationError, administrationJson } from "@/lib/administration-http";
import { requireAccess } from "@/services/auth.service";
import { resetAdministrationPin, saveAdministrationEmployee } from "@/services/administration.service";
import { administrationOptions, listAdministrationEmployees } from "@/repositories/administration.repository";
import { MANAGEMENT_PERMISSION } from "@/utils/access";
import { AuthError } from "@/types/auth.types";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAccess(await readSessionToken(), MANAGEMENT_PERMISSION);
    const [employees, options] = await Promise.all([listAdministrationEmployees(), administrationOptions()]);
    return administrationJson({ employees, ...options });
  } catch (error) { return administrationError(error); }
}
export async function POST(request: Request) {
  try {
    const actor = await requireAccess(await readSessionToken(), MANAGEMENT_PERMISSION);
    return administrationJson(await saveAdministrationEmployee(actor.id, await readJsonObject(request)));
  } catch (error) { return administrationError(error); }
}
export async function PATCH(request: Request) {
  try {
    const actor = await requireAccess(await readSessionToken(), MANAGEMENT_PERMISSION);
    const body = await readJsonObject(request);
    if (typeof body.id !== "string" || !body.id) throw new AuthError("INVALID_INPUT", "Selecione um funcionário.", 400);
    if (body.action === "reset-pin") return administrationJson(await resetAdministrationPin(actor.id, body.id, body.pin ?? "0000"));
    if (body.action !== "update") throw new AuthError("INVALID_INPUT", "Ação inválida.", 400);
    return administrationJson(await saveAdministrationEmployee(actor.id, body, body.id));
  } catch (error) { return administrationError(error); }
}
