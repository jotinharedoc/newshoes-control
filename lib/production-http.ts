import { authErrorResponse } from "@/lib/auth-http";
import { ProductionError } from "@/types/production-error.types";

export function productionErrorResponse(error: unknown) {
  if (error instanceof ProductionError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }

  return authErrorResponse(error);
}

