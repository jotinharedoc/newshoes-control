"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { EmployeeDayWorks } from "@/services/employee-work.service";

const processes: Record<string, { href: string; api: string }> = {
  Higienização: { href: "/producao/higienizacao", api: "/api/production/hygiene" },
  Finalização: { href: "/producao/finalizacao", api: "/api/production/finalization" },
  Pintura: { href: "/producao/pintura", api: "/api/production/painting" },
};
const statuses = { IN_PROGRESS: "Em andamento", PAUSED: "Pausado", DEFERRED: "Adiado", COMPLETED: "Concluído", CANCELLED: "Cancelado" };
const units = { PAIR: "Par", LEFT_FOOT: "Pé esquerdo", RIGHT_FOOT: "Pé direito" };
const time = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
type Work = EmployeeDayWorks["works"][number];

export function EmployeeWorks({ data }: { data: EmployeeDayWorks }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Work | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function resume(work: Work) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const process = processes[work.processName];
      const reopening = work.status === "COMPLETED";
      const response = await fetch(reopening ? "/api/production/my-work" : process.api, {
        method: reopening ? "POST" : "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productionId: work.id, version: work.version, ...(!reopening ? { action: work.status === "PAUSED" ? "resume" : "continue" } : {}) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Não foi possível retomar o trabalho.");
      setSelected(null); router.push(process.href); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Falha de conexão. Tente novamente."); router.refresh(); }
    finally { setBusy(false); }
  }
  return <section className="space-y-4" aria-label="Trabalhos do dia">
    <div className="flex items-center justify-between gap-3"><p>{data.day.split("-").reverse().join("/")} · Horário de São Paulo</p><button type="button" className="secondary-button" onClick={() => router.refresh()} disabled={busy}>Atualizar</button></div>
    {error && <p role="alert" className="rounded-xl border border-red-400 p-4">{error}</p>}
    {selected && <div role="region" aria-label="Confirmar retomada" className="rounded-2xl border border-(--brand) bg-(--surface) p-5">
      <h2 className="break-all text-lg font-semibold">Retomar o trabalho do código {selected.code}?</h2>
      <p className="my-3 text-sm text-(--text-secondary)">Use esta opção quando o serviço foi marcado como concluído, mas ainda precisa ser finalizado. O trabalho atual, se houver, ficará para continuar depois. Não será gerada outra comissão.</p>
      <div className="flex flex-wrap gap-3"><button className="primary-button" disabled={busy} onClick={() => resume(selected)}>{busy ? "Retomando…" : "Confirmar retomada"}</button><button className="secondary-button" disabled={busy} onClick={() => setSelected(null)}>Cancelar</button></div>
    </div>}
    {!data.works.length && <p className="rounded-2xl border border-(--border) p-6">Nenhum trabalho com atividade hoje.</p>}
    {data.works.map(work => {
      const process = processes[work.processName];
      const isReturn = work.kind === "RETURN";
      return <article key={work.id} className="space-y-3 rounded-2xl border border-(--border) bg-(--surface) p-5">
        <h2 className="break-all text-xl font-semibold">Código {work.code}</h2>
        <p>{work.processName} · {units[work.unit]}{isReturn ? " · Retorno" : ""}</p>
        <p className="text-sm text-(--text-secondary)">{statuses[work.status]} · Atividade às {time.format(new Date(work.activityAt))}</p>
        {isReturn ? <Link className="secondary-button inline-flex" href="/producao/retornos">Ver meus retornos</Link> : process && work.status !== "CANCELLED" && (
          work.status === "IN_PROGRESS" ? <Link className="primary-button inline-flex" href={process.href}>Continuar</Link> :
            <button className="primary-button" disabled={busy} onClick={() => { setError(""); if (work.status === "COMPLETED") setSelected(work); else void resume(work); }}>{work.status === "COMPLETED" ? "Retomar trabalho" : "Retomar"}</button>
        )}
      </article>;
    })}
  </section>;
}
