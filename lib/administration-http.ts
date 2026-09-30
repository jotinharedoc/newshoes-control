import { Prisma } from "@/lib/generated/prisma/client";
import { AuthError } from "@/types/auth.types";

export const administrationJson = (data: unknown) => Response.json(data, { headers: { "Cache-Control": "private, no-store" } });

export function administrationError(error: unknown) {
  if (error instanceof AuthError) return Response.json({ error: { message: error.message } }, { status: error.status });
  if (error instanceof SyntaxError) return Response.json({ error: { message: "Envie dados válidos." } }, { status: 400 });
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code)) {
    return Response.json({ error: { message: "Outra operação alterou estes dados. Atualize e tente novamente." } }, { status: 409 });
  }
  // Do not log request bodies or Prisma arguments: they can contain a PIN hash.
  console.error("Falha administrativa", error instanceof Error ? error.name : "unknown");
  return Response.json({ error: { message: "Não foi possível concluir. Atualize os dados antes de tentar novamente." } }, { status: 500 });
}
