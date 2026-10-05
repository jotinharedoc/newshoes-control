import Link from "next/link";
import { requirePageAccess } from "@/lib/auth-page";
import { ProductionNavigation } from "@/components/production/production-navigation";
import { MonthlySummary } from "@/components/production/monthly-summary";
import { currentBrazilMonth, getEmployeeMonthlySummary } from "@/services/employee-summary.service";
import { AuthError } from "@/types/auth.types";

export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ month?: string | string[] }> }) {
  const employee = await requirePageAccess();
  const query = await searchParams;
  const month = query.month === undefined ? currentBrazilMonth() : typeof query.month === "string" ? query.month : "";
  let data;
  try { data = await getEmployeeMonthlySummary(employee.id, month); }
  catch (error) {
    if (error instanceof AuthError && error.status === 400) return <main className="p-6"><p role="alert">{error.message}</p><Link href="/producao/minha-producao">Voltar ao mês atual</Link></main>;
    throw error;
  }
  return <main className="mx-auto min-h-screen max-w-3xl space-y-6 px-4 py-6">
    <ProductionNavigation canAccessManagement={employee.canAccessManagement} current="/producao/minha-producao" />
    <header><p className="text-sm text-(--brand)">{employee.name}</p><h1 className="text-3xl font-semibold">Minha produção</h1><p className="mt-2 text-(--text-secondary)">Acompanhe sua produção e comissão por mês.</p></header>
    <MonthlySummary data={data} />
  </main>;
}
