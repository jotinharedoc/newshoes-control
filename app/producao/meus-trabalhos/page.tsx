import { requirePageAccess } from "@/lib/auth-page";
import { ProductionNavigation } from "@/components/production/production-navigation";
import { EmployeeWorks } from "@/components/production/employee-works";
import { getEmployeeDayWorks } from "@/services/employee-work.service";

export const dynamic = "force-dynamic";
export default async function Page() {
  const employee = await requirePageAccess();
  const data = await getEmployeeDayWorks(employee.id);
  return <main className="mx-auto min-h-screen max-w-3xl space-y-6 px-4 py-6">
    <ProductionNavigation canAccessManagement={employee.canAccessManagement} current="/producao/meus-trabalhos" />
    <header><p className="text-sm text-(--brand)">{employee.name}</p><h1 className="text-3xl font-semibold">Meus trabalhos de hoje</h1><p className="mt-2 text-(--text-secondary)">Trabalhos com atividade hoje, incluindo os iniciados em dias anteriores.</p></header>
    <EmployeeWorks data={data} />
  </main>;
}
