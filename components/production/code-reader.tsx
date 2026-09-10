"use client";

import { useEffect, useMemo, useState } from "react";

import { ActiveProduction } from "@/components/production/active-production";
import { CameraScanner } from "@/components/production/camera-scanner";
import type { HygieneAction, HygieneOverview, HygieneProductionView } from "@/types/production.types";

type CodeReaderProps = {
  employeeName: string;
  initialOverview: HygieneOverview;
};

function formatDuration(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

async function readOverview(response: Response): Promise<HygieneOverview> {
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload && payload.error && typeof payload.error === "object" && "message" in payload.error && typeof payload.error.message === "string"
      ? payload.error.message
      : "Não foi possível concluir a ação.";
    throw new Error(message);
  }
  return payload as HygieneOverview;
}

export function CodeReader({ employeeName, initialOverview }: CodeReaderProps) {
  const [overview, setOverview] = useState(initialOverview);
  const [code, setCode] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [clock, setClock] = useState(() => Date.now());
  const current = overview.current;

  useEffect(() => {
    if (current?.status !== "IN_PROGRESS") return;
    const interval = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [current?.id, current?.status]);

  const elapsedTime = useMemo(() => {
    if (!current) return "00:00:00";
    const sinceObservation = current.status === "IN_PROGRESS"
      ? Math.max(0, clock - new Date(current.observedAt).getTime())
      : 0;
    return formatDuration(current.elapsedMilliseconds + sinceObservation);
  }, [clock, current]);

  function clearForm() {
    setCode("");
    setConfirming(false);
    setSwitching(false);
  }

  async function submitRequest(init: RequestInit) {
    setPending(true);
    setError("");
    try {
      const nextOverview = await readOverview(await fetch("/api/production/hygiene", init));
      setOverview(nextOverview);
      clearForm();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível concluir a ação.");
    } finally {
      setPending(false);
    }
  }

  async function startProduction() {
    const body: Record<string, unknown> = { code };
    if (switching && current) {
      body.currentProductionId = current.id;
      body.version = current.version;
    }
    await submitRequest({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function runAction(production: HygieneProductionView, action: HygieneAction) {
    if (action === "finish" && !window.confirm(`Finalizar a Higienização do código ${production.code}?`)) return;
    await submitRequest({
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productionId: production.id, version: production.version, action }),
    });
  }

  if (current && !switching) {
    return (
      <div className="space-y-4">
        {error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
        <ActiveProduction
          code={current.code}
          processName={current.processName}
          employeeName={employeeName}
          elapsedTime={elapsedTime}
          paused={current.status === "PAUSED"}
          pending={pending}
          onPause={() => void runAction(current, "pause")}
          onResume={() => void runAction(current, "resume")}
          onDefer={() => void runAction(current, "defer")}
          onFinish={() => void runAction(current, "finish")}
          onStartNext={() => { setError(""); setSwitching(true); }}
        />
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="space-y-5">
        <section className="rounded-2xl border border-(--border) bg-(--surface-soft) p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-(--brand)">{switching ? "Confirmar troca" : "Confirmar produção"}</p>
          <h2 className="mt-2 text-2xl font-semibold text-(--text-primary)">
            {switching ? `Finalizar ${current?.code} e iniciar ${code}?` : `Iniciar código ${code}?`}
          </h2>
          <p className="mt-3 text-sm leading-6 text-(--text-secondary)">
            {switching ? "A produção atual só será finalizada depois desta confirmação." : "A Higienização será registrada como par completo."}
          </p>
        </section>
        {error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
        <button type="button" onClick={() => void startProduction()} disabled={pending} className="primary-button w-full">
          {pending ? "Salvando..." : switching ? "Confirmar troca" : "Confirmar e iniciar"}
        </button>
        <button type="button" onClick={() => setConfirming(false)} disabled={pending} className="w-full rounded-2xl border border-(--border-strong) px-4 py-3.5 font-semibold text-(--text-primary) transition hover:bg-(--surface-hover) disabled:opacity-50">
          Voltar e corrigir
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!current && overview.deferred.length > 0 && (
        <section className="rounded-2xl border border-(--border) bg-(--surface-soft) p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-(--brand)">Para continuar depois</p>
          <div className="mt-4 space-y-3">
            {overview.deferred.map((production) => (
              <div key={production.id} className="flex items-center justify-between gap-4 rounded-2xl border border-(--border) bg-(--surface) p-4">
                <div>
                  <p className="font-semibold text-(--text-primary)">Código {production.code}</p>
                  <p className="mt-1 font-mono text-sm tabular-nums text-(--text-secondary)">{formatDuration(production.elapsedMilliseconds)}</p>
                </div>
                <button type="button" onClick={() => void runAction(production, "continue")} disabled={pending} className="rounded-xl bg-(--brand) px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                  Retomar
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {switching && current && (
        <div className="rounded-2xl border border-(--brand) bg-(--brand-soft) p-4 text-sm text-(--text-primary)">
          O código {current.code} continua {current.status === "PAUSED" ? "pausado" : "em andamento"} até você confirmar a troca.
        </div>
      )}

      <CameraScanner onDetected={setCode} />

      <div className="flex items-center gap-4">
        <div className="h-px flex-1 bg-(--border)" />
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-(--text-muted)">ou</span>
        <div className="h-px flex-1 bg-(--border)" />
      </div>

      <div>
        <label htmlFor="shoe-code" className="text-sm font-medium text-(--text-primary)">Código do tênis</label>
        <input id="shoe-code" name="shoeCode" type="text" inputMode="numeric" pattern="[0-9]+" maxLength={10} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="Ex.: 1001693" className="auth-input" />
        <p className="mt-2 text-sm text-(--text-muted)">Leia pela câmera ou digite o código manualmente.</p>
      </div>

      {error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}

      <button type="button" onClick={() => setConfirming(true)} disabled={pending || !/^\d{4,10}$/.test(code)} className="primary-button w-full">
        Continuar
      </button>

      {switching && (
        <button type="button" onClick={clearForm} disabled={pending} className="w-full rounded-2xl border border-(--border-strong) px-4 py-3.5 font-semibold text-(--text-primary)">
          Cancelar troca
        </button>
      )}
    </div>
  );
}
