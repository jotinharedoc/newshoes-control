"use client";

import { useEffect, useRef, useState } from "react";

import { CameraScanner } from "@/components/production/camera-scanner";

import type {
  PaintingAction,
  PaintingOverview,
  PaintingProductionView,
} from "@/services/painting.service";

type PaintingReaderProps = {
  employeeName: string;
  initialOverview: PaintingOverview;
};

type ApiError = {
  error?: {
    message?: string;
  };
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

function ProductionTimer({
  production,
}: {
  production: PaintingProductionView;
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

export function PaintingReader({
  employeeName,
  initialOverview,
}: PaintingReaderProps) {
  const [overview, setOverview] = useState(initialOverview);
  const [code, setCode] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const requestInProgress = useRef(false);

  const current = overview.current;
  const validCode = /^\d{1,64}$/.test(code);

  async function fetchOverview() {
    const response = await fetch("/api/production/painting", {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Não foi possível atualizar a produção.");
    }

    const updated = (await response.json()) as PaintingOverview;
    setOverview(updated);
  }

  async function refresh() {
    if (requestInProgress.current) return;

    requestInProgress.current = true;
    setBusy(true);
    setError("");
    setNotice("");

    try {
      await fetchOverview();
    } catch {
      setError(
        "Não foi possível atualizar. Verifique a conexão e tente novamente.",
      );
    } finally {
      requestInProgress.current = false;
      setBusy(false);
    }
  }

  async function send(
    method: "POST" | "PATCH",
    body: Record<string, unknown>,
    successMessage: string,
  ) {
    if (requestInProgress.current) return;

    requestInProgress.current = true;
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/production/painting", {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const payload = (await response
          .json()
          .catch(() => null)) as ApiError | null;

        setError(
          payload?.error?.message ?? "Não foi possível concluir a operação.",
        );

        // Recupera o estado atual se outra tela alterou a produção.
        try {
          await fetchOverview();
        } catch {
          // Mantém o erro original e permite atualização manual.
        }

        return;
      }

      const updated = (await response.json()) as PaintingOverview;

      setOverview(updated);
      setCode("");
      setConfirming(false);
      setNotice(successMessage);
    } catch {
      setError(
        "Não foi possível confirmar o resultado. Clique em Atualizar produção antes de tentar novamente.",
      );
    } finally {
      requestInProgress.current = false;
      setBusy(false);
    }
  }

  function startProduction() {
    if (!validCode) return;

    void send(
      "POST",
      {
        code,
        kind: "STANDARD",
        unit: "PAIR",
      },
      "Pintura iniciada e salva.",
    );
  }

  function changeState(
    production: PaintingProductionView,
    action: PaintingAction,
  ) {
    const messages: Record<PaintingAction, string> = {
      pause: "Pintura pausada para banheiro.",
      resume: "Pintura retomada após pausa banheiro.",
      defer: "Pintura salva para continuar depois.",
      continue: "Pintura retomada como continuação.",
      finish: "Pintura concluída e comissão registrada.",
    };

    void send(
      "PATCH",
      {
        productionId: production.id,
        version: production.version,
        action,
      },
      messages[action],
    );
  }

  return (
    <div className="space-y-6">
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
          onClick={() => void refresh()}
          disabled={busy}
          className="text-sm font-semibold text-(--brand) disabled:opacity-50"
        >
          {busy ? "Aguarde..." : "Atualizar produção"}
        </button>
      </div>

      {current ? (
        <section className="rounded-2xl border border-(--border) bg-(--surface-soft) p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm text-(--text-secondary)">
                Pintura · Par completo
              </p>

              <h2 className="mt-2 text-2xl font-semibold text-(--text-primary)">
                {current.code}
              </h2>

              <p className="mt-2 text-sm text-(--text-secondary)">
                {employeeName} ·{" "}
                {current.status === "PAUSED" ? "Pausada" : "Em andamento"}
              </p>
            </div>

            <ProductionTimer
              key={`${current.id}-${current.version}-${current.observedAt}`}
              production={current}
            />
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                changeState(
                  current,
                  current.status === "PAUSED" ? "resume" : "pause",
                )
              }
              className="rounded-xl border border-(--border-strong) px-4 py-3 font-semibold text-(--text-primary) disabled:opacity-50"
            >
                            {current.status === "PAUSED"
                ? "Voltei do banheiro"
                : "Pausa banheiro"}
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => changeState(current, "defer")}
              className="rounded-xl border border-(--border-strong) px-4 py-3 font-semibold text-(--text-primary) disabled:opacity-50"
            >
              Deixar para depois
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => changeState(current, "finish")}
              className="primary-button w-full disabled:opacity-50 sm:col-span-2"
            >
              Concluir pintura
            </button>
          </div>
        </section>
      ) : confirming ? (
        <section className="rounded-2xl border border-(--border) bg-(--surface-soft) p-5">
          <h2 className="text-xl font-semibold text-(--text-primary)">
            Confirmar pintura
          </h2>

          <dl className="mt-5 space-y-3 text-sm">
            <div>
              <dt className="text-(--text-secondary)">Código</dt>
              <dd className="font-semibold text-(--text-primary)">{code}</dd>
            </div>

            <div>
              <dt className="text-(--text-secondary)">Funcionário</dt>
              <dd className="text-(--text-primary)">{employeeName}</dd>
            </div>

            <div>
              <dt className="text-(--text-secondary)">Serviço</dt>
              <dd className="text-(--text-primary)">
                Pintura normal · Par completo
              </dd>
            </div>
          </dl>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirming(false)}
              className="rounded-xl border border-(--border-strong) px-4 py-3 font-semibold text-(--text-primary) disabled:opacity-50"
            >
              Voltar e corrigir
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={startProduction}
              className="primary-button w-full disabled:opacity-50"
            >
              {busy ? "Salvando..." : "Confirmar e iniciar"}
            </button>
          </div>
        </section>
      ) : (
        <div className="space-y-5">
          <CameraScanner
            onDetected={(detectedCode) => {
              setCode(detectedCode.trim());
              setError("");
              setNotice("");
            }}
          />

          <div>
            <label
              htmlFor="painting-code"
              className="text-sm font-medium text-(--text-secondary)"
            >
              Código manual
            </label>

            <input
              id="painting-code"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={64}
              value={code}
              disabled={busy}
              onChange={(event) =>
                setCode(event.target.value.replace(/\D/g, "").slice(0, 64))
              }
              className="auth-input"
            />
          </div>

          <button
            type="button"
            disabled={busy || !validCode}
            onClick={() => {
              setError("");
              setNotice("");
              setConfirming(true);
            }}
            className="primary-button w-full disabled:opacity-50"
          >
            Conferir e iniciar
          </button>
        </div>
      )}

      {overview.deferred.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-(--text-primary)">
            Pinturas para continuar
          </h2>

          {overview.deferred.map((production) => (
            <article
              key={production.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-(--border) bg-(--surface-soft) p-4"
            >
              <div>
                <p className="font-semibold text-(--text-primary)">
                  {production.code}
                </p>
                <p className="mt-1 text-sm text-(--text-secondary)">
                  Tempo trabalhado:{" "}
                  {formatDuration(production.elapsedMilliseconds)}
                </p>
              </div>

              <button
                type="button"
                disabled={busy} 
                onClick={() => changeState(production, "continue")}
                className="rounded-xl bg-(--brand) px-4 py-3 font-semibold text-white disabled:opacity-50"
              >
                Continuar pintura
              </button>
            </article>
          ))}

          {current && (
            <p className="text-sm text-(--text-secondary)">
              Ao continuar outra pintura, a atual ficará para depois, com o tempo salvo.
            </p>
          )}
        </section>
      )}
    </div>
  );
}