"use client";

import { useEffect, useRef, useState } from "react";

import { CameraScanner } from "@/components/production/camera-scanner";
import { EmployeeBreakControl } from "@/components/production/employee-break-control";

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
  "w-full rounded-2xl bg-(--brand) px-4 py-3.5 font-semibold text-white transition hover:bg-(--brand-hover) disabled:cursor-not-allowed disabled:opacity-50";

const secondary =
  "w-full rounded-2xl border border-(--border-strong) px-4 py-3.5 font-semibold text-(--text-primary) transition hover:bg-(--surface-hover) disabled:cursor-not-allowed disabled:opacity-50";

const panel =
  "rounded-2xl border border-(--border) bg-(--surface-soft) p-5";

const actionMessages: Record<Action, string> = {
  pause: "Produção pausada. O tempo da pausa não será contado.",
  resume: "Produção retomada após a pausa.",
  defer: "Produção salva para continuar depois.",
  continue: "Continuação iniciada. Outros trabalhos abertos ficaram para depois.",
  finish: "Finalização concluída e comissão registrada.",
};

async function requestOverview(
  method: "GET" | "POST" | "PATCH",
  body?: Record<string, unknown>,
): Promise<Snapshot> {
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
      data?.error?.message ?? "Não foi possível concluir a operação.",
    );
  }

  return {
    overview: data as Overview,
    receivedAt: Date.now(),
  };
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

  const requestInProgress = useRef(false);

  const current = snapshot?.overview.current ?? null;
  const validCode = /^\d{1,64}$/.test(code.trim());

  useEffect(() => {
    let cancelled = false;

    requestOverview("GET")
      .then((nextSnapshot) => {
        if (cancelled) return;

        setSnapshot(nextSnapshot);
        setClock(nextSnapshot.receivedAt);
      })
      .catch((failure: unknown) => {
        if (!cancelled) {
          setError(errorMessage(failure));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (current?.status !== "IN_PROGRESS") return;

    function updateClock() {
      setClock(Date.now());
    }

    const timer = window.setInterval(updateClock, 1000);

    window.addEventListener("focus", updateClock);
    document.addEventListener("visibilitychange", updateClock);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", updateClock);
      document.removeEventListener("visibilitychange", updateClock);
    };
  }, [current?.id, current?.status]);

  function applySnapshot(nextSnapshot: Snapshot) {
    setSnapshot(nextSnapshot);
    setClock(nextSnapshot.receivedAt);
  }

  async function refresh() {
    if (requestInProgress.current) return;

    requestInProgress.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    setConfirming(false);

    try {
      applySnapshot(await requestOverview("GET"));
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      requestInProgress.current = false;
      setBusy(false);
    }
  }

  async function start() {
    if (requestInProgress.current || !snapshot) return;

    if (!validCode) {
      setError("Informe um código com 1 a 64 números.");
      return;
    }

    requestInProgress.current = true;
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const nextSnapshot = await requestOverview("POST", {
        code: code.trim(),
        unit,
        kind: "STANDARD",
      });

      applySnapshot(nextSnapshot);
      setConfirming(false);
      setCode("");
      setMessage(
        "Finalização iniciada. Outros trabalhos abertos ficaram para depois.",
      );
    } catch (failure) {
      setError(errorMessage(failure));

      try {
        applySnapshot(await requestOverview("GET"));
      } catch {
        // Preserva a mensagem original caso a atualização também falhe.
      }
    } finally {
      requestInProgress.current = false;
      setBusy(false);
    }
  }

  async function changeState(production: Production, action: Action) {
    if (requestInProgress.current) return;

    requestInProgress.current = true;
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const nextSnapshot = await requestOverview("PATCH", {
        productionId: production.id,
        version: production.version,
        action,
      });

      applySnapshot(nextSnapshot);
      setConfirming(false);
      setCode("");
      setMessage(actionMessages[action]);
    } catch (failure) {
      setError(errorMessage(failure));

      try {
        applySnapshot(await requestOverview("GET"));
      } catch {
        // Preserva a mensagem original caso a atualização também falhe.
      }
    } finally {
      requestInProgress.current = false;
      setBusy(false);
    }
  }

  const elapsed =
    (current?.elapsedMilliseconds ?? 0) +
    (current?.status === "IN_PROGRESS" && snapshot
      ? Math.max(0, clock - snapshot.receivedAt)
      : 0);

  return (
    <EmployeeBreakControl
      disabled={busy}
      onWorkChanged={async () => applySnapshot(await requestOverview("GET"))}
    >
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
          Carregando suas finalizações...
        </p>
      )}

      <button
        type="button"
        onClick={() => void refresh()}
        disabled={busy || (!snapshot && !error)}
        className={secondary}
      >
        {busy ? "Aguarde..." : "Atualizar dados"}
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

          <div>
            <p className="font-mono text-xl tabular-nums text-(--brand)">
              {formatTime(elapsed)}
            </p>

            <p className="mt-1 text-xs text-(--text-secondary)">
              Tempo efetivamente trabalhado
            </p>
          </div>

          {current.status === "PAUSED" && <button
            type="button"
            disabled={busy}
            onClick={() =>
              void changeState(current, "resume")
            }
            className={secondary}
          >
            Retomar trabalho pausado
          </button>}

          <button
            type="button"
            disabled={busy}
            onClick={() => void changeState(current, "defer")}
            className={secondary}
          >
            Deixar para depois
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => void changeState(current, "finish")}
            className={primary}
          >
            Concluir finalização
          </button>
        </section>
      )}

      {snapshot && (
        <section className="space-y-5">
          <h2 className="text-lg font-semibold text-(--text-primary)">
            {current ? "Iniciar outro código" : "Nova finalização"}
          </h2>

          <p className="text-sm leading-6 text-(--text-secondary)">
            Ao confirmar outro código, qualquer trabalho seu em andamento
            ou pausado ficará para depois, com o tempo trabalhado salvo.
            A comissão será registrada quando esse trabalho for concluído.
          </p>

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
                onClick={() => void start()}
                disabled={busy || !validCode}
                className={primary}
              >
                {busy ? "Salvando..." : "Confirmar e iniciar"}
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
                  const detectedCode = value.trim();

                  setCode(detectedCode);
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
                autoComplete="off"
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
                disabled={busy}
                onClick={() => void changeState(production, "continue")}
                className={secondary}
              >
                Continuar este serviço
              </button>
            </div>
          ))}

          <p className="text-sm text-(--text-secondary)">
            Ao continuar um serviço, qualquer outro trabalho seu em andamento
            ou pausado ficará para depois, com o tempo salvo.
          </p>
        </section>
      )}
    </div>
    </EmployeeBreakControl>
  );
}
