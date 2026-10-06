"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
export function ProductionCorrection({ id, version, cancelled, restorable }: { id: string; version: number; cancelled: boolean; restorable: boolean }) {
  const [open, setOpen] = useState(false); const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const lock = useRef(false); const router = useRouter();
  async function save() {
    if (lock.current) return; lock.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/management/productions", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, version, action: cancelled ? "restore" : "cancel", reason }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error?.message ?? "Não foi possível corrigir.");
      setOpen(false); setReason(""); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Falha de conexão."); }
    finally { lock.current = false; setBusy(false); }
  }
  if (cancelled && !restorable) return <p>Histórico anulado; restauração exige conferência da Gerência.</p>;
  return <div className="space-y-3">
    {!open ? <button type="button" className="secondary-button" onClick={() => setOpen(true)}>{cancelled ? "Restaurar registro" : "Anular registro"}</button> :
      <form className="space-y-3" onSubmit={e => { e.preventDefault(); void save(); }}>
        <p>{cancelled ? "Restaurar este registro com o histórico e a comissão originais?" : "Anular este registro? Ele deixará de contar na produção, comissão e relatórios. O histórico será preservado para auditoria."}</p>
        <label className="block">Motivo obrigatório<textarea className="auth-input" required maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} disabled={busy} /></label>
        <button className="primary-button" disabled={busy || !reason.trim()}>Confirmar {cancelled ? "restauração" : "anulação"}</button>
        <button type="button" className="secondary-button" disabled={busy} onClick={() => setOpen(false)}>Voltar</button>
      </form>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
