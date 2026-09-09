import { cookies } from "next/headers";
import { AuthError } from "@/types/auth.types";
import { AUTH_COOKIE_NAME } from "@/utils/auth";

export async function readSessionToken() {
  return (await cookies()).get(AUTH_COOKIE_NAME)?.value ?? "";
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const body: unknown = await request.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new AuthError("INVALID_INPUT", "Os dados enviados são inválidos.", 400);
  }
  return body as Record<string, unknown>;
}

export function authErrorResponse(error: unknown) {
  if (error instanceof AuthError) {
    return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  if (error instanceof SyntaxError) {
    return Response.json({ error: { code: "INVALID_JSON", message: "Os dados enviados são inválidos." } }, { status: 400 });
  }
  console.error("Erro inesperado na autenticação:", error);
  return Response.json({ error: { code: "INTERNAL_ERROR", message: "Não foi possível concluir a operação. Tente novamente." } }, { status: 500 });
}
