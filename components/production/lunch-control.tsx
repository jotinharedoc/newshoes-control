"use client";

import { useEffect, useRef, useState } from "react";

import type { LunchOverview } from "@/services/lunch.service";

type LunchControlProps = {
  initialOverview: LunchOverview;
  onChanged: () => void | Promise<void>;
};

type ApiError = {
  error?: {
    message?: string;
  };
};

function formatDuration(milliseconds: number) {
  const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0",
  )}:${String(seconds).padStart(2, "0")}`;
}

function LunchTimer({
  startedAt,
  observedAt,
}: {
  startedAt: string;
  observedAt: string;
}) {
  const [extraMilliseconds, setExtraMilliseconds] = useState(0);

  const initialMilliseconds = Math.max(
    0,
    new Date(observedAt).getTime() - new Date(startedAt).getTime(),
  );

  useEffect(() => {
    const baseline = performance.now();

    const interval = window.setInterval(() => {
      setExtraMilliseconds(performance.now() - baseline);
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <span className="font-mono text-lg font-semibold text-(--brand)">
      {formatDuration(initialMilliseconds + extraMilliseconds)}
    </span>
  );
}

export function LunchControl({
  initialOverview,
  onChanged,
}: LunchControlProps) {
  const [overview, setOverview] = useState(initialOverview);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const requestInProgress = useRef(false);

  async function fetchOverview() {
    const response = await fetch("/api/production/lunch", {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Não foi possível consultar o almoço.");
    }

    const result = (await response.json()) as LunchOverview;
    setOverview(result);
  }

  async function refresh() {
    if (requestInProgress.current) return;

    requestInProgress.current = true;
    setBusy(true);
    setError("");
    setNotice("");

    try {
      await fetchOverview();
      await onChanged();
    } catch {
      setError(
        "Não foi possível atualizar tudo. Verifique a conexão e tente novamente.",
      );
    } finally {
      requestInProgress.current = false;
      setBusy(false);
    }
  }

  async function changeLunch() {
    if (requestInProgress.current) return;

    requestInProgress.current = true;
    setBusy(true);
    setError("");
    setNotice("");

    const current = overview.current;
    const action = current ? "finish" : "start";

    try {
      const response = await fetch("/api/production/lunch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          current
            ? {
                action: "finish",
                lunchId: current.id,
              }
            : {
                action: "start",
              },
        ),
      });

      if (!response.ok) {
        const payload = (await response
          .json()
          .catch(() => null)) as ApiError | null;

        setError(
          payload?.error?.message ??
            "Não foi possível registrar a ação.",
        );

        try {
          await fetchOverview();
          await onChanged();
        } catch {
          // Mantém o erro original e permite atualizar manualmente.
        }

        return;
      }

      const result = (await response.json()) as LunchOverview;
      setOverview(result);

      setNotice(
        action === "finish"
          ? "Almoço encerrado. Você já pode iniciar ou continuar um trabalho."
          : result.current?.pausedProductionId
            ? "Almoço iniciado. Seu trabalho ficou salvo para continuar depois."
            : "Almoço iniciado.",
      );

      try {
        await onChanged();
      } catch {
        setError(
          "O almoço foi salvo, mas não foi possível atualizar a produção. Atualize antes de continuar.",
        );
      }
    } catch {
      setError(
        "Não foi possível confirmar o resultado. Clique em Atualizar almoço antes de tentar novamente.",
      );
    } finally {
      requestInProgress.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-(--border) bg-(--surface-soft) p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-(--text-primary)">
            {overview.current ? "Em horário de almoço" : "Intervalo de almoço"}
          </h2>

          <p className="mt-1 text-sm text-(--text-secondary)">
            {overview.current
              ? "Encerre o intervalo quando voltar."
              : "Registre sua saída mesmo se não houver tênis em execução."}
          </p>
        </div>

        {overview.current && (
          <LunchTimer
            key={`${overview.current.id}-${overview.observedAt}`}
            startedAt={overview.current.startedAt}
            observedAt={overview.observedAt}
          />
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-xl bg-red-500/10 p-3 text-sm text-(--text-primary)"
        >
          {error}
        </p>
      )}

      {notice && (
        <p
          role="status"
          className="rounded-xl bg-(--brand-soft) p-3 text-sm text-(--text-primary)"
        >
          {notice}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          disabled={busy}
          onClick={() => void changeLunch()}
          className="primary-button disabled:opacity-50"
        >
          {busy
            ? "Aguarde..."
            : overview.current
              ? "Voltei do almoço"
              : "Pausa almoço"}
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => void refresh()}
          className="rounded-xl border border-(--border-strong) px-4 py-3 font-semibold text-(--text-secondary) disabled:opacity-50"
        >
          Atualizar almoço
        </button>
      </div>
    </section>
  );
}