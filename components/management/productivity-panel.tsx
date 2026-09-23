import type { ManagementDashboardData } from "@/services/management.service";

function duration(ms: number | null) {
  if (ms === null) return "Não disponível";
  const minutes = Math.floor(ms / 60_000);
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}
const number = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const panel = "rounded-2xl border border-(--border) bg-(--surface) p-5";

export function ProductivityPanel({ metrics }: { metrics: ManagementDashboardData["metrics"] }) {
  const totals = metrics.totals;
  return <>
    <section className={panel} aria-labelledby="productivity-title">
      <h2 id="productivity-title" className="text-lg font-semibold">Produtividade</h2>
      <dl className="mt-4 grid grid-cols-2 gap-5 lg:grid-cols-4">
        {[
          ["Higienizações", totals.hygienePairs], ["Finalizações completas", totals.finalizationPairs],
          ["Finalizações de 1 pé", totals.finalizationFeet], ["Pinturas", totals.paintingPairs],
          ["Produções por dia com atividade", number(totals.averageProductionsPerDay)],
          ["Tempo médio por produção", duration(totals.averageProductionMs)],
          ["Banheiro", duration(totals.bathroomMs)], ["Almoço", duration(totals.lunchMs)],
          ["Ociosidade estimada — dias completos", duration(totals.idleMs)],
        ].map(([label, value]) => <div key={label}>
          <dt className="text-sm text-(--text-secondary)">{label}</dt>
          <dd className="mt-1 text-xl font-semibold">{value}</dd>
        </div>)}
      </dl>
      <p className="mt-4 text-xs leading-5 text-(--text-secondary)">{metrics.parameters.idleRule}</p>
    </section>
    <section className={panel} aria-labelledby="goals-title">
      <h2 id="goals-title" className="text-lg font-semibold">Metas por funcionário</h2>
      <p className="mt-2 text-sm text-(--text-secondary)">Manhã: antes das {metrics.parameters.afternoonStartsAtHour}h. Tarde: a partir das {metrics.parameters.afternoonStartsAtHour}h. Percentuais médios dos dias com atividade; retornos não somam para a meta.</p>
      {metrics.byEmployee.length === 0 ? <p className="mt-4">Sem atividade registrada no período.</p> :
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {metrics.byEmployee.map(item => <article key={item.id} className="rounded-xl border border-(--border) p-4">
            <h3 className="font-semibold">{item.name}</h3>
            <dl className="mt-3 space-y-2 text-sm">
              {[
                ["Meta da manhã", `${number(item.morningGoalPercent)}%`],
                ["Meta da tarde", `${number(item.afternoonGoalPercent)}%`],
                ["Turnos com meta atingida", item.goalsAchieved],
                ["Produções/dia com atividade", number(item.averageProductionsPerDay)],
                ["Tempo médio por produção", duration(item.averageProductionMs)],
                ["Ociosidade estimada", duration(item.idleMs)],
              ].map(([label, value]) => <div key={label} className="flex justify-between gap-3"><dt>{label}</dt><dd className="text-right font-medium">{value}</dd></div>)}
            </dl>
          </article>)}
        </div>}
      <details className="mt-4 text-sm text-(--text-secondary)">
        <summary className="cursor-pointer py-2">Como os indicadores são calculados</summary>
        <div className="mt-2 space-y-3 leading-6">
          <p>{metrics.parameters.averageRule}</p><p>{metrics.parameters.durationRule}</p><p>{metrics.parameters.goalRule}</p>
          <p>Jornada em horas, de domingo a sábado: {metrics.parameters.dailyHours.join(" / ")}. Dias sem registros não representam faltas.</p>
          <p>Trabalhos de processos diferentes somam proporcionalmente. Quantidade para 100% por turno:</p>
          <ul className="list-disc pl-5">{Object.entries(metrics.parameters.targets).flatMap(([process, targets]) => Object.entries(targets).map(([unit, quantity]) => <li key={`${process}:${unit}`}>{process}: {quantity} {unit === "PAIR" ? "pares" : unit === "LEFT_FOOT" ? "pés esquerdos" : "pés direitos"}.</li>))}</ul>
        </div>
      </details>
    </section>
  </>;
}
