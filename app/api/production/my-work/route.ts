import { readJsonObject, readSessionToken } from "@/lib/auth-http";
import { productionErrorResponse } from "@/lib/production-http";
import { requireAccess } from "@/services/auth.service";
import { getEmployeeDayWorks, reopenEmployeeWork } from "@/services/employee-work.service";

export async function GET() {
  try {
    const employee = await requireAccess(await readSessionToken());
    return Response.json(await getEmployeeDayWorks(employee.id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return productionErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const employee = await requireAccess(await readSessionToken());
    const body = await readJsonObject(request);
    return Response.json(await reopenEmployeeWork(employee.id,
      typeof body.productionId === "string" ? body.productionId : "",
      typeof body.version === "number" ? body.version : Number.NaN), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return productionErrorResponse(error); }
}
