import { redirect } from "next/navigation";
import { readSessionToken } from "@/lib/auth-http";
import { getAuthenticatedEmployee, requireAccess } from "@/services/auth.service";
import { AuthError } from "@/types/auth.types";

export async function currentEmployee() {
  return getAuthenticatedEmployee(await readSessionToken());
}

export async function requirePageAccess(permission?: string) {
  try {
    return await requireAccess(await readSessionToken(), permission);
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
    if (error.code === "PIN_CHANGE_REQUIRED") redirect("/trocar-pin");
    if (error.code === "FORBIDDEN") redirect("/producao");
    redirect("/");
  }
}
