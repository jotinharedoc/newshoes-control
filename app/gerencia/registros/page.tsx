import { requirePageAccess } from "@/lib/auth-page";
import { MANAGEMENT_PERMISSION } from "@/utils/access";
import { normalizeShoeCode } from "@/utils/shoe-code";
import { listProductionRecords } from "@/services/production-administration.service";
import { ProductionCorrection } from "@/components/management/production-correction";
import { AdminNavigation } from "@/components/management/admin-navigation";
import { productionStatusLabels, workUnitLabels } from "@/utils/production-labels";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ code?: string | string[] }> }) {
  await requirePageAccess(MANAGEMENT_PERMISSION);
  const params = await searchParams; const input = typeof params.code === "string" ? params.code.trim() : "";
  let code: string | undefined; try { code = input ? normalizeShoeCode(input) : undefined; }
  catch { return <main className="p-6"><AdminNavigation /><p role="alert">Informe um código com 1 a 64 números.</p></main>; }
  const records = await listProductionRecords(code);
  const format = (value: Date | null) => value?.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) ?? "—";
  return <main className="mx-auto max-w-5xl space-y-6 p-6"><AdminNavigation /><h1 className="text-3xl font-semibold">Registros de produção</h1>
    <form method="get"><label>Buscar código<input className="auth-input" name="code" defaultValue={input} inputMode="numeric" pattern="[0-9]{1,64}" maxLength={64} /></label><button className="primary-button">Buscar</button></form>
    <p>Últimos 100 registros encontrados, incluindo anulados para auditoria. Anulação não é necessária para reutilizar códigos.</p>
    {!records.length && <p>Nenhum registro encontrado.</p>}
    {records.map(record => {
      const ms = record.sessions.reduce((sum, s) => sum + Math.max(0, (s.endedAt ?? new Date()).getTime() - s.startedAt.getTime()), 0);
      return <article key={record.id} className="space-y-3 rounded-xl border border-(--border) p-5">
        <h2 className="break-all text-xl font-semibold">{record.shoe.code} · Uso {record.occurrence?.sequence ?? 1}</h2>
        <p>{record.employee.name} · {record.processType.name} · {workUnitLabels[record.unit]} · {record.kind === "RETURN" ? "Retorno" : "Normal"} · {productionStatusLabels[record.status]}</p>
        <p>Início: {format(record.startedAt)} · Conclusão: {format(record.completedAt)}</p>
        <p>Duração: {(ms / 3_600_000).toFixed(2)} horas · Comissão histórica: {Number(record.commission?.amount ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}{record.status === "CANCELLED" ? " (fora do pagamento)" : ""}</p>
        <p className="break-all text-xs">Registro: {record.id} · Ocorrência: {record.occurrenceId}</p>
        <ProductionCorrection id={record.id} version={record.version} cancelled={record.status === "CANCELLED"} restorable={record.cancelledFromStatus === "COMPLETED"} />
      </article>;
    })}
  </main>;
}
