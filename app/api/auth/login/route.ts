import { cookies } from "next/headers";
import { authenticateEmployee } from "@/services/auth.service";
import { AUTH_COOKIE_NAME } from "@/utils/auth";
import { authErrorResponse, readJsonObject } from "@/lib/auth-http";

export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request);
    const result = await authenticateEmployee(
      typeof body.employeeId === "string" ? body.employeeId : "",
      typeof body.pin === "string" ? body.pin : "",
    );
    (await cookies()).set(AUTH_COOKIE_NAME, result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: result.expiresAt,
    });
    return Response.json({ employee: result.employee, destination: result.destination });
  } catch (error) {
    return authErrorResponse(error);
  }
}
