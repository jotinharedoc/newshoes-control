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
  const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  return <main className="mx-auto min-h-screen max-w-3xl space-y-6 px-4 py-6">
    <Link className="underline" href="/gerencia/funcionarios">Voltar aos funcionários</Link>
    <header><h1 className="text-3xl font-semibold">{data.employee.name}</h1><p>Resumo de produção e comissão{!data.employee.active ? " · Funcionário inativo" : ""}</p></header>
    <form method="get" className="flex flex-wrap items-end gap-3"><label>Mês<input type="month" name="month" required defaultValue={month} className="auth-input" /></label><button className="primary-button">Consultar</button></form>
    <dl className="grid gap-4 sm:grid-cols-2">{[
      ["Higienização", `${data.hygienePairs} pares`], ["Finalização", `${data.finalizationPairs} pares`],
      ["Finalização — pés avulsos", `${data.finalizationFeet} pés`], ["Pintura", `${data.paintingPairs} pares`],
      ["Valor total de comissão", money.format(data.earnedCommissionCents / 100)],
    ].map(([label, value]) => <div key={label} className="rounded-2xl border border-(--border) bg-(--surface) p-5"><dt>{label}</dt><dd className="mt-2 text-2xl font-semibold">{value}</dd></div>)}</dl>
    <p className="text-sm text-(--text-secondary)">Quantidades de produções padrão concluídas no mês. Comissão efetivamente lançada no período, com valores históricos preservados. Retornos e continuações não duplicam comissão.</p>
  </main>;
}
