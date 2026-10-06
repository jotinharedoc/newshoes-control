"use client";
import { useEffect, useState } from "react";
import type { OccurrenceChoice as Choice } from "@/services/shoe-occurrence.service";
import { productionStatusLabels, workUnitLabels } from "@/utils/production-labels";
type Occurrence = { id: string; sequence: number; createdAt: string;
  productions: { processType: { name: string }; unit: string; status: string }[] };
export function OccurrenceChoice({ code, onChange }: { code: string; onChange: (choice: Choice | undefined) => void }) {
  const [rows, setRows] = useState<Occurrence[]>([]);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    onChange(undefined);
    async function load() {
      try {
        const response = await fetch(`/api/production/occurrences?${new URLSearchParams({ code: code.trim() })}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message ?? "Não foi possível consultar este código.");
        setRows(data); setReady(true);
        if (!data.length) onChange({ newOccurrence: true, expectedLatestId: null });
      } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Falha de conexão."); }
    }
    void load(); return () => controller.abort();
  }, [code, onChange]);
  return <div className="space-y-3 rounded-xl border border-(--border) p-4">
    {error ? <p role="alert">{error} Volte e consulte novamente.</p> : !ready ? <p>Conferindo os usos deste código…</p> : !rows.length ?
      <p>Novo tênis: primeiro uso deste código.</p> : <>
        <label className="block font-semibold">Este é o mesmo tênis ou um novo tênis?
          <select defaultValue="" className="auth-input" onChange={e => onChange(e.target.value === "new" ?
            { newOccurrence: true, expectedLatestId: rows[0].id } : e.target.value ? { occurrenceId: e.target.value } : undefined)}>
            <option value="" disabled>Selecione antes de iniciar</option>
            <option value="new">Novo tênis — novo uso do código</option>
            {rows.map(row => <option key={row.id} value={row.id}>Mesmo tênis — uso {row.sequence} · {new Date(row.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</option>)}
          </select>
        </label>
        <p className="text-sm">Novo tênis preserva todos os usos anteriores. Para continuar ou reabrir um serviço, use Meus trabalhos.</p>
        <ul className="text-sm">{rows.slice(0, 3).map(row => <li key={row.id}>Uso {row.sequence}: {row.productions.map(p => `${p.processType.name} / ${workUnitLabels[p.unit]} / ${productionStatusLabels[p.status]}`).join("; ")}</li>)}</ul>
      </>}
  </div>;
}
