import { readSessionToken } from "@/lib/auth-http";
import { productionErrorResponse } from "@/lib/production-http";
import { requireAccess } from "@/services/auth.service";
import { listCodeOccurrences } from "@/services/shoe-occurrence.service";
export async function GET(request: Request) {
  try {
    await requireAccess(await readSessionToken());
    return Response.json(await listCodeOccurrences(new URL(request.url).searchParams.get("code") ?? ""),
      { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return productionErrorResponse(error); }
}
