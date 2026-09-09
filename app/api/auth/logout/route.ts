import { cookies } from "next/headers";
import { authErrorResponse, readSessionToken } from "@/lib/auth-http";
import { logoutEmployee } from "@/services/auth.service";
import { AUTH_COOKIE_NAME } from "@/utils/auth";

export async function POST() {
  try {
    await logoutEmployee(await readSessionToken());
    (await cookies()).delete(AUTH_COOKIE_NAME);
    return Response.json({ destination: "/" });
  } catch (error) {
    return authErrorResponse(error);
  }
}
