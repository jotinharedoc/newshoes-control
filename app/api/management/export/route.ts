import { requirePageAccess } from "@/lib/auth-page";
import { getManagementDashboard } from "@/services/management.service";
import { buildManagementWorkbook } from "@/services/management-workbook.service";
import { MANAGEMENT_PERMISSION } from "@/utils/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const dayMs = 24 * 60 * 60 * 1000;

function parseDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const parsed = new Date(`${value}T00:00:00Z`);

  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    return null;
  }

  return new Date(`${value}T00:00:00-03:00`);
}

export async function GET(request: Request) {
  // A mesma proteção usada na página da gerência.
  await requirePageAccess(MANAGEMENT_PERMISSION);

  const params = new URL(request.url).searchParams;
  const startValue = params.get("start");
  const endValue = params.get("end");

  const start = parseDate(startValue);
  const end = parseDate(endValue);

  if (
    !start ||
    !end ||
    start > end ||
    end.getTime() - start.getTime() >= 366 * dayMs
  ) {
    return Response.json(
      { error: "Informe um período válido de até 366 dias." },
      { status: 400 },
    );
  }

  const employeeId = params.get("employeeId") || undefined;
  const processTypeId = params.get("processTypeId") || undefined;

  const data = await getManagementDashboard({
    start,
    endExclusive: new Date(end.getTime() + dayMs),
    employeeId,
    processTypeId,
  });

  const workbook = buildManagementWorkbook(data, { startValue: startValue!, endValue: endValue!, employeeId, processTypeId });

  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        `attachment; filename="newshoes-${startValue}-${endValue}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
