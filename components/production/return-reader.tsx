"use client";

import { useEffect, useRef, useState } from "react";

import type {
  ReturnAction,
  ReturnProductionView,
} from "@/services/return.service";

type ReturnReaderProps = {
  initialReturns: ReturnProductionView[];
};

type ApiError = {
  error?: {
    message?: string;
  };
};

const unitLabels: Record<string, string> = {
  PAIR: "Par completo",
  LEFT_FOOT: "Pé esquerdo",
  RIGHT_FOOT: "Pé direito",
};

function formatDuration(milliseconds: number) {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0",
  )}:${String(remainingSeconds).padStart(2, "0")}`;
}

function ReturnTimer({
  production,
}: {
  production: ReturnProductionView;
}) {
  const [extraMilliseconds, setExtraMilliseconds] = useState(0);

  useEffect(() => {
    if (production.status !== "IN_PROGRESS") return;

    const baseline = performance.now();

    const interval = window.setInterval(() => {
      setExtraMilliseconds(performance.now() - baseline);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [production.status]);

  return (
    <span className="font-mono text-lg font-semibold text-(--brand)">
      {formatDuration(
        production.elapsedMilliseconds +
          (production.status === "IN_PROGRESS" ? extraMilliseconds : 0),
      )}
    </span>
  );
}

export function ReturnReader({ initialReturns }: ReturnReaderProps) {
  const [returns, setReturns] = useState(initialReturns);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const requestInProgress = useRef(false);

  const hasCurrentReturn = returns.some(
    (item) =>
      item.status === "IN_PROGRESS" || item.status === "PAUSED",
  );

  async function fetchReturns() {
    const response = await fetch("/api/production/returns", {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Não foi possível atualizar os retornos.");
    }

    const result = (await response.json()) as ReturnProductionView[];
    setReturns(result);
  }

  async function refresh() {
    if (requestInProgress.current) return;

    requestInProgress.current = true;
    setBusy(true);
    setError("");
    setNotice("");

    try {
      await fetchReturns();
    } catch {
      setError(
        "Não foi possível atualizar. Verifique a conexão e tente novamente.",
      );
    } finally {
      requestInProgress.current = false;
      setBusy(false);
    }
  }

  async function changeState(
    production: ReturnProductionView,
    action: ReturnAction,
  ) {
    if (requestInProgress.current) return;

    requestInProgress.current = true;
    setBusy(true);
    setError("");
    setNotice("");

    const messages: Record<ReturnAction, string> = {
      start: production.hasStarted
        ? "Retorno retomado como continuação."
        : "Retorno iniciado.",
      pause: "Retorno pausado para banheiro.",
      resume: "Retorno retomado após pausa banheiro.",
      defer: "Retorno salvo para continuar depois.",
      finish: "Retorno concluído, sem nova comissão.",
    };

    try {
      const response = await fetch("/api/production/returns", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productionId: production.id,
          version: production.version,
          action,
        }),
      });

      if (!response.ok) {
        const payload = (await response
          .json()
          .catch(() => null)) as ApiError | null;

        setError(
          payload?.error?.message ??
            "Não foi possível concluir a operação.",
        );

        try {
          await fetchReturns();
        } catch {
          // Mantém a mensagem original e permite atualização manual.
        }

        return;
      }

      const result = (await response.json()) as ReturnProductionView[];

      setReturns(result);
      setNotice(messages[action]);
    } catch {
      setError(
        "Não foi possível confirmar o resultado. Atualize os retornos antes de tentar novamente.",
      );
    } finally {
      requestInProgress.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-(--text-primary)"
        >
          {error}
        </p>
      )}

      {notice && (
        <p
          role="status"
          className="rounded-xl bg-(--brand-soft) p-4 text-sm text-(--text-primary)"
        >
          {notice}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          disabled={busy}
          onClick={() => void refresh()}
          className="text-sm font-semibold text-(--brand) disabled:opacity-50"
        >
          {busy ? "Aguarde..." : "Atualizar retornos"}
        </button>
      </div>

      {returns.length === 0 && (
        <div className="rounded-2xl border border-dashed border-(--border-strong) bg-(--surface-soft) p-5">
          <p className="font-semibold text-(--text-primary)">
            Nenhum retorno pendente
          </p>
          <p className="mt-2 text-sm text-(--text-secondary)">
            Os retornos atribuídos a você pelo controle de qualidade
            aparecerão aqui.
          </p>
        </div>
      )}

      {returns.map((production) => {
        const deferred = production.status === "DEFERRED";
        const paused = production.status === "PAUSED";
        const running = production.status === "IN_PROGRESS";

        const statusLabel = running
          ? "Em andamento"
          : paused
            ? "Pausado"
            : production.hasStarted
              ? "Para continuar"
              : "Aguardando início";

        return (
          <article
            key={production.id}
            className="rounded-2xl border border-(--border) bg-(--surface-soft) p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-(--brand)">
                  Retorno {production.processName}
                </p>

                <h2 className="mt-2 text-2xl font-semibold text-(--text-primary)">
                  {production.code}
                </h2>

                <p className="mt-2 text-sm text-(--text-secondary)">
                  {unitLabels[production.unit] ?? production.unit}
                  {" · "}
                  {statusLabel}
                </p>
              </div>

              <ReturnTimer
                key={`${production.id}-${production.version}-${production.observedAt}`}
                production={production}
              />
            </div>

            <div className="mt-4 rounded-xl border border-(--border) bg-(--surface) p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-(--text-muted)">
                O que precisa ser corrigido
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-(--text-primary)">
                {production.reason}
              </p>
            </div>

            <p className="mt-3 text-xs text-(--text-secondary)">
              Retrabalho sem nova comissão.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {deferred && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void changeState(production, "start")}
                  className="primary-button w-full disabled:opacity-50 sm:col-span-2"
                >
                  {production.hasStarted
                    ? "Continuar retorno"
                    : "Iniciar retorno"}
                </button>
              )}

              {(running || paused) && (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void changeState(
                        production,
                        paused ? "resume" : "pause",
                      )
                    }
                    className="rounded-xl border border-(--border-strong) px-4 py-3 font-semibold text-(--text-primary) disabled:opacity-50"
                  >
                  {paused ? "Voltei do banheiro" : "Pausa banheiro"}
                  </button>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void changeState(production, "defer")}
                    className="rounded-xl border border-(--border-strong) px-4 py-3 font-semibold text-(--text-primary) disabled:opacity-50"
                  >
                    Deixar para depois
                  </button>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void changeState(production, "finish")}
                    className="primary-button w-full disabled:opacity-50 sm:col-span-2"
                  >
                    Concluir retorno
                  </button>
                </>
              )}
            </div>

            {deferred && hasCurrentReturn && (
              <p className="mt-3 text-sm text-(--text-secondary)">
                  Ao iniciar outro retorno, o atual ficará para depois, com o tempo salvo.
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}