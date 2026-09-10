"use client";

import { useEffect, useState } from "react";
import { CameraScanner } from "@/components/production/camera-scanner";

type Unit = "PAIR" | "LEFT_FOOT" | "RIGHT_FOOT";
type Action = "pause" | "resume" | "defer" | "continue" | "finish";

type Production = {
  id: string;
  code: string;
  processName: string;
  unit: Unit;
  status: "IN_PROGRESS" | "PAUSED" | "DEFERRED" | "COMPLETED" | "CANCELLED";
  version: number;
  elapsedMilliseconds: number;
  observedAt: string;
};

type Overview = {
  current: Production | null;
  deferred: Production[];
};

type Snapshot = {
  overview: Overview;
  receivedAt: number;
};

type Props = {
  employeeName: string;
};

const endpoint = "/api/production/finalization";

const options: { value: Unit; label: string }[] = [
  { value: "PAIR", label: "Par completo" },
  { value: "LEFT_FOOT", label: "Pé esquerdo" },
  { value: "RIGHT_FOOT", label: "Pé direito" },
];

const primary =
  "w-full rounded-2xl bg-(--brand) px-4 py-3.5 font-semibold text-white transition hover:bg-(--brand-hover) disabled:opacity-50 disabled:cursor-not-allowed";

const secondary =
  "w-full rounded-2xl border border-(--border-strong) px-4 py-3.5 font-semibold text-(--text-primary) transition hover:bg-(--surface-hover) disabled:opacity-50 disabled:cursor-not-allowed";

const panel =
  "rounded-2xl border border-(--border) bg-(--surface-soft) p-5";

async function requestOverview(
  method: "GET" | "POST" | "PATCH",
  body?: Record<string, unknown>,
): Promise<Overview> {
  const response = await fetch(endpoint, {
    method,
    cache: "no-store",
    ...(body
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error?.message ?? "Não foi possível concluir a operação.",
    );
  }

  return data as Overview;
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Não foi possível comunicar com o servidor.";
}

function formatTime(milliseconds: number) {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000);

  const hours = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const remaining = String(seconds % 60).padStart(2, "0");

  return `${hours}:${minutes}:${remaining}`;
}

function unitLabel(unit: Unit) {
  return options.find((option) => option.value === unit)?.label ?? unit;
}

export function FinalizationReader({ employeeName }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [clock, setClock] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [code, setCode] = useState("");
  const [unit, setUnit] = useState<Unit>("PAIR");
  const [confirming, setConfirming] = useState(false);

  const current = snapshot?.overview.current ?? null;

  useEffect(() => {
    let cancelled = false;

    requestOverview("GET")
      .then((overview) => {
        if (cancelled) return;

        const now = Date.now();
        setSnapshot({ overview, receivedAt: now });
        setClock(now);
      })
      .catch((failure: unknown) => {
        if (!cancelled) setError(errorMessage(failure));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (current?.status !== "IN_PROGRESS") return;

    const timer = window.setInterval(() => {
      setClock(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [current?.id, current?.status]);

  function applyOverview(overview: Overview) {
    const now = Date.now();
    setSnapshot({ overview, receivedAt: now });
    setClock(now);
  }

  async function refresh() {
    setBusy(true);
    setError("");
    setMessage("");
    setConfirming(false);

    try {
      applyOverview(await requestOverview("GET"));
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    if (busy) return;

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const overview = await requestOverview("POST", {
        code: code.trim(),
        unit,
        kind: "STANDARD",
      });

      applyOverview(overview);
      setConfirming(false);
      setCode("");
      setMessage("Finalização iniciada e salva.");
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  async function changeState(production: Production, action: Action) {
    if (busy) return;

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const overview = await requestOverview("PATCH", {
        productionId: production.id,
        version: production.version,
        action,
      });

      applyOverview(overview);
      setConfirming(false);

      const messages: Record<Action, string> = {
        pause: "Produção pausada. O tempo da pausa não será contado.",
        resume: "Produção retomada.",
        defer: "Produção salva para continuar depois.",
        continue: "Continuação iniciada no mesmo registro.",
        finish: "Finalização concluída e comissão registrada.",
      };

      setMessage(messages[action]);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  const elapsed =
    (current?.elapsedMilliseconds ?? 0) +
    (current?.status === "IN_PROGRESS" && snapshot
      ? Math.max(0, clock - snapshot.receivedAt)
      : 0);

  const validCode = /^\d{1,64}$/.test(code.trim());

  return (
    <div className="space-y-5">
      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-400"
        >
          {error}
        </div>
      )}

      {message && (
        <p
          role="status"
          className="rounded-2xl bg-(--brand-soft) p-4 text-sm text-(--text-primary)"
        >
          {message}
        </p>
      )}

      {!snapshot && !error && (
        <p className="text-sm text-(--text-secondary)">
          Carregando suas finalizações…
        </p>
      )}

      <button
        type="button"
        onClick={refresh}
        disabled={busy}
        className={secondary}
      >
        {busy ? "Aguarde…" : "Atualizar dados"}
      </button>

      {current && (
        <section className={`${panel} space-y-4`}>
          <div>
            <p className="text-sm text-(--text-secondary)">
              {current.status === "PAUSED" ? "Pausada" : "Em andamento"}
            </p>

            <h2 className="mt-1 text-2xl font-semibold text-(--text-primary)">
              {current.code}
            </h2>

            <p className="mt-2 text-sm text-(--text-secondary)">
              {unitLabel(current.unit)} · {employeeName}
            </p>
          </div>

          <p className="font-mono text-xl tabular-nums text-(--brand)">
            {formatTime(elapsed)}
          </p>

          <button
            type="button"
            disabled={busy}
            onClick={() =>
              changeState(
                current,
                current.status === "PAUSED" ? "resume" : "pause",
              )
            }
            className={secondary}
          >
            {current.status === "PAUSED" ? "Retomar" : "Pausar"}
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => changeState(current, "defer")}
            className={secondary}
          >
            Deixar para depois
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => changeState(current, "finish")}
            className={primary}
          >
            Concluir finalização
          </button>
        </section>
      )}

      {snapshot && !current && (
        <section className="space-y-5">
          {confirming ? (
            <div className={`${panel} space-y-4`}>
              <h2 className="text-xl font-semibold text-(--text-primary)">
                Confirmar finalização
              </h2>

              <dl className="space-y-3 text-sm text-(--text-primary)">
                <div>
                  <dt className="text-(--text-secondary)">Código</dt>
                  <dd className="text-xl font-semibold">{code.trim()}</dd>
                </div>
                <div>
                  <dt className="text-(--text-secondary)">Parte</dt>
                  <dd>{unitLabel(unit)}</dd>
                </div>
                <div>
                  <dt className="text-(--text-secondary)">Funcionário</dt>
                  <dd>{employeeName}</dd>
                </div>
              </dl>

              <button
                type="button"
                onClick={start}
                disabled={busy}
                className={primary}
              >
                {busy ? "Salvando…" : "Confirmar e iniciar"}
              </button>

              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={busy}
                className={secondary}
              >
                Voltar e corrigir
              </button>
            </div>
          ) : (
            <>
              <fieldset disabled={busy} className="space-y-3">
                <legend className="text-sm font-medium text-(--text-primary)">
                  Tipo de finalização
                </legend>

                <div className="grid gap-3 sm:grid-cols-3">
                  {options.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={unit === option.value}
                      onClick={() => setUnit(option.value)}
                      className={`rounded-2xl border p-4 font-semibold text-(--text-primary) disabled:opacity-50 ${
                        unit === option.value
                          ? "border-(--brand) bg-(--brand-soft)"
                          : "border-(--border) bg-(--surface-soft)"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <CameraScanner
                  onDetected={(value) => {
                    setCode(value.trim());
                    setError("");
                    setMessage("");
                  }}
                />

                <label
                  htmlFor="finalization-code"
                  className="block text-sm font-medium text-(--text-primary)"
                >
                  Código do tênis
                </label>

                <input
                  id="finalization-code"
                  type="text"
                  inputMode="numeric"
                  maxLength={64}
                  value={code}
                  onChange={(event) => {
                    setCode(event.target.value);
                    setError("");
                    setMessage("");
                  }}
                  placeholder="Ex.: 1001693"
                  className="auth-input"
                />

                {code && !validCode && (
                  <p className="text-sm text-(--text-secondary)">
                    Informe somente números, com até 64 dígitos.
                  </p>
                )}

                <button
                  type="button"
                  disabled={busy || !validCode}
                  onClick={() => {
                    setError("");
                    setMessage("");
                    setConfirming(true);
                  }}
                  className={primary}
                >
                  Conferir dados
                </button>
              </fieldset>
            </>
          )}
        </section>
      )}

      {snapshot && snapshot.overview.deferred.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-(--text-primary)">
            Para continuar depois
          </h2>

          {snapshot.overview.deferred.map((production) => (
            <div key={production.id} className={`${panel} space-y-3`}>
              <p className="font-semibold text-(--text-primary)">
                {production.code} · {unitLabel(production.unit)}
              </p>

              <p className="text-sm text-(--text-secondary)">
                Tempo trabalhado: {formatTime(production.elapsedMilliseconds)}
              </p>

              <button
                type="button"
                disabled={busy || Boolean(current)}
                onClick={() => changeState(production, "continue")}
                className={secondary}
              >
                Continuar este serviço
              </button>
            </div>
          ))}

          {current && (
            <p className="text-sm text-(--text-secondary)">
              Conclua ou deixe o serviço atual para depois antes de continuar outro.
            </p>
          )}
        </section>
      )}
    </div>
  );
}