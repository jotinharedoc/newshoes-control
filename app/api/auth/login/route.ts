import { cookies } from "next/headers";

import { authenticateEmployee } from "@/services/auth.service";
import { AuthError } from "@/types/auth.types";
import { AUTH_COOKIE_NAME } from "@/utils/auth";

interface LoginRequestBody {
  employeeId?: unknown;
  pin?: unknown;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LoginRequestBody;

    const result = await authenticateEmployee(
      typeof body.employeeId === "string" ? body.employeeId : "",
      typeof body.pin === "string" ? body.pin : "",
    );

    const cookieStore = await cookies();

    cookieStore.set(AUTH_COOKIE_NAME, result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: result.expiresAt,
    });

    return Response.json({
      employee: result.employee,
      destination: result.destination,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json(
        {
          error: {
            code: error.code,
            message: error.message,
          },
        },
        {
          status: error.status,
        },
      );
    }

    if (error instanceof SyntaxError) {
      return Response.json(
        {
          error: {
            code: "INVALID_JSON",
            message: "Os dados enviados são inválidos.",
          },
        },
        {
          status: 400,
        },
      );
    }

    console.error("Erro inesperado no login:", error);

    return Response.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Não foi possível realizar a entrada.",
        },
      },
      {
        status: 500,
      },
    );
  }
}