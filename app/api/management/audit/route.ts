import { readSessionToken } from "@/lib/auth-http";
import { administrationError, administrationJson } from "@/lib/administration-http";
import { requireAccess } from "@/services/auth.service";
import { listAdministrationAudit } from "@/repositories/administration.repository";
import { MANAGEMENT_PERMISSION } from "@/utils/access";
import { AuthError } from "@/types/auth.types";
export const dynamic = "force-dynamic";
function date(value: string | null, end = false) {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AuthError("INVALID_INPUT", "Período inválido.", 400);
  const parsed = new Date(`${value}T00:00:00-03:00`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new AuthError("INVALID_INPUT", "Data inválida.", 400);
  return new Date(parsed.getTime() + (end ? 86_400_000 : 0));
}
export async function GET(request: Request) {
  try {
    await requireAccess(await readSessionToken(), MANAGEMENT_PERMISSION);
    const params = new URL(request.url).searchParams;
    const start = date(params.get("start")), end = date(params.get("end"), true);
    if (start && end && start >= end) throw new AuthError("INVALID_INPUT", "Período inválido.", 400);
    return administrationJson(await listAdministrationAudit({ start, end, actorId: params.get("actorId") ?? undefined, action: params.get("action") ?? undefined, targetType: params.get("targetType") ?? undefined }));
  } catch (error) { return administrationError(error); }
}
