import { readJsonObject, readSessionToken } from "@/lib/auth-http";
import { administrationError, administrationJson } from "@/lib/administration-http";
import { requireAccess } from "@/services/auth.service";
import { correctProduction } from "@/services/production-administration.service";
import { MANAGEMENT_PERMISSION } from "@/utils/access";
export async function POST(request: Request) {
  try {
    const actor = await requireAccess(await readSessionToken(), MANAGEMENT_PERMISSION);
    const body = await readJsonObject(request);
    return administrationJson(await correctProduction(actor.id, typeof body.id === "string" ? body.id : "",
      typeof body.version === "number" ? body.version : NaN, typeof body.action === "string" ? body.action : "",
      typeof body.reason === "string" ? body.reason : ""));
  } catch (error) { return administrationError(error); }
}
