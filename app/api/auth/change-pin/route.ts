import { authErrorResponse, readJsonObject, readSessionToken } from "@/lib/auth-http";
import { changeEmployeePin } from "@/services/auth.service";

export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request);
    const result = await changeEmployeePin(
      await readSessionToken(),
      typeof body.newPin === "string" ? body.newPin : "",
      typeof body.confirmPin === "string" ? body.confirmPin : "",
    );
    return Response.json(result);
  } catch (error) {
    return authErrorResponse(error);
  }
}
