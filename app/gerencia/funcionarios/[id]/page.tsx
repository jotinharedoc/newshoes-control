import { MonthlySummary } from "@/components/production/monthly-summary";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageAccess } from "@/lib/auth-page";
import { MANAGEMENT_PERMISSION } from "@/utils/access";
import { currentBrazilMonth, getEmployeeMonthlySummary } from "@/services/employee-summary.service";
import { AuthError } from "@/types/auth.types";

export const dynamic = "force-dynamic";
export default async function Page({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ month?: string | string[] }>;
}) {
  await requirePageAccess(MANAGEMENT_PERMISSION);
  const { id } = await params;
  const query = await searchParams;
  const month = typeof query.month === "string" ? query.month : currentBrazilMonth();
  let data;
  try { data = await getEmployeeMonthlySummary(id, month); }
  catch (error) {
    if (error instanceof AuthError && error.status === 404) notFound();
    if (error instanceof AuthError && error.status === 400) return <main className="p-6"><p role="alert">{error.message}</p><Link href={`/gerencia/funcionarios/${id}`}>Voltar ao mês atual</Link></main>;
    throw error;
  }
  return <main className="mx-auto min-h-screen max-w-3xl space-y-6 px-4 py-6">
    <Link className="underline" href="/gerencia/funcionarios">Voltar aos funcionários</Link>
    <header><h1 className="text-3xl font-semibold">{data.employee.name}</h1><p>Resumo de produção e comissão{!data.employee.active ? " · Funcionário inativo" : ""}</p></header>
    <MonthlySummary data={data} />
  </main>;
}
