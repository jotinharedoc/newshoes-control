import type { getEmployeeMonthlySummary } from "@/services/employee-summary.service";

export function MonthlySummary({ data }: { data: Awaited<ReturnType<typeof getEmployeeMonthlySummary>> }) {
  const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  return <>
    <form method="get" className="flex flex-wrap items-end gap-3"><label>Mês<input type="month" name="month" required defaultValue={data.month} className="auth-input" /></label><button className="primary-button">Consultar</button></form>
    <dl className="grid gap-4 sm:grid-cols-2">{[
      ["Higienização", `${data.hygienePairs} pares`], ["Finalização", `${data.finalizationPairs} pares`],
      ["Finalização — pés avulsos", `${data.finalizationFeet} pés`], ["Pintura", `${data.paintingPairs} pares`],
      ["Comissão acumulada", money.format(data.earnedCommissionCents / 100)],
    ].map(([label, value]) => <div key={label} className="rounded-2xl border border-(--border) bg-(--surface) p-5"><dt>{label}</dt><dd className="mt-2 text-2xl font-semibold">{value}</dd></div>)}</dl>
    <p className="text-sm text-(--text-secondary)">Quantidades de produções padrão concluídas no mês. Comissão efetivamente lançada no período, com valores históricos preservados. Retornos, continuações e retomadas não duplicam comissão.</p>
  </>;
}
