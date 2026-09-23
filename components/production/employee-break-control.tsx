"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import type { EmployeeBreakOverview } from "@/services/employee-break.service";

type BreakKind = "LUNCH" | "BATHROOM";

type ApiError = {
  error?: {
    message?: string;
  };
};

function formatDuration(milliseconds: number) {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0",
  )}:${String(seconds % 60).padStart(2, "0")}`;
}

function BreakTimer({
  startedAt,
  observedAt,
}: {
  startedAt: string;
  observedAt: string;
}) {
  const [extra, setExtra] = useState(0);

  const initial = Math.max(
    0,
    new Date(observedAt).getTime() - new Date(startedAt).getTime(),
  );

  useEffect(() => {
    const baseline = performance.now();

    const interval = window.setInterval(() => {
      setExtra(performance.now() - baseline);
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <span className="font-mono text-xl font-semibold text-(--brand)">
      {formatDuration(initial + extra)}
    </span>
  );
}

async function readOverview() {
  const response = await fetch("/api/production/breaks", {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Não foi possível consultar seus intervalos.");
  }

  return (await response.json()) as EmployeeBreakOverview;
}

type EmployeeBreakControlProps = {
  children?: ReactNode;
  onWorkChanged?: () => Promise<void>;
  disabled?: boolean;
  canUseBreaks?: boolean;
};

export function EmployeeBreakControl(props: EmployeeBreakControlProps) {
  if (props.canUseBreaks === false) return <>{props.children}</>;
  return <OperationalEmployeeBreakControl {...props} />;
}

function OperationalEmployeeBreakControl({
  children,
  onWorkChanged,
  disabled: workBusy = false,
}: EmployeeBreakControlProps) {
  const [overview, setOverview] = useState<EmployeeBreakOverview | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const requestInProgress = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;

    async function load() {
      try {
        const result = await readOverview();

        if (!cancelled) {
          setOverview(result);
        }
      } catch {
        if (!cancelled) {
          setError("Não foi possível consultar seus intervalos.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
      mounted.current = false;
    };
  }, []);

  async function refresh() {
    if (requestInProgress.current || workBusy) return;

    requestInProgress.current = true;
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const result = await readOverview();

      if (mounted.current) {
        setOverview(result);
      }
      await onWorkChanged?.();
    } catch {
      if (mounted.current) {
        setOverview(null);
        setError(
          "Não foi possível atualizar. Verifique a conexão e tente novamente.",
        );
      }
    } finally {
      requestInProgress.current = false;

      if (mounted.current) {
        setBusy(false);
      }
    }
  }

  async function send(kind?: BreakKind) {
    if (requestInProgress.current || workBusy || !overview) return;

    const current = overview.current;

    if (!current && !kind) return;

    requestInProgress.current = true;
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/production/breaks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          current
            ? {
                action: "finish",
                breakId: current.id,
              }
            : {
                action: "start",
                kind,
              },
        ),
      });

      if (!response.ok) {
        const payload = (await response
          .json()
          .catch(() => null)) as ApiError | null;

        if (mounted.current) {
          setError(
            payload?.error?.message ??
              "Não foi possível registrar o intervalo.",
          );
        }

        try {
          const updated = await readOverview();

          if (mounted.current) {
            setOverview(updated);
          }
          await onWorkChanged?.();
        } catch {
          if (mounted.current) {
            setOverview(null);
          }
        }

        return;
      }

      const updated =
        (await response.json()) as EmployeeBreakOverview;

      if (!mounted.current) return;

      setOverview(updated);
      await onWorkChanged?.();

      if (current) {
        setNotice(
          current.kind === "LUNCH"
            ? "Almoço encerrado. Os trabalhos deixados para depois podem ser continuados."
            : "Intervalo de banheiro encerrado. O trabalho pausado por ele foi retomado se a autorização continua válida.",
        );
      } else {
        setNotice(
          kind === "LUNCH"
            ? "Almoço registrado. Se havia trabalho ativo, ele ficou para depois."
            : "Banheiro registrado. Se havia trabalho em execução, o cronômetro foi pausado.",
        );
      }
    } catch {
      if (mounted.current) {
        setOverview(null);
        setError(
          "Não foi possível confirmar o resultado. Atualize os intervalos antes de tentar novamente.",
        );
      }
    } finally {
      requestInProgress.current = false;

      if (mounted.current) {
        setBusy(false);
      }
    }
  }

  const current = overview?.current;
  const disabled = loading || busy || overview === null || workBusy;

  return (
    <>
    <section className="mt-6 space-y-4 rounded-2xl border border-(--border) bg-(--surface-soft) p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-(--text-primary)">
            Meus intervalos
          </h2>

          <p className="mt-1 text-sm text-(--text-secondary)">
            {loading
              ? "Consultando intervalos..."
              : current
                ? current.kind === "LUNCH"
                  ? "Você está em horário de almoço."
                  : "Você está em pausa banheiro."
                : "Registre seu intervalo com ou sem tênis em execução."}
          </p>
        </div>

        {current && overview && (
          <BreakTimer
            key={`${current.id}-${overview.observedAt}`}
            startedAt={current.startedAt}
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

      <div className="grid gap-3 sm:grid-cols-2">
        {current ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => void send()}
            className="primary-button w-full disabled:opacity-50 sm:col-span-2"
          >
            {busy
              ? "Salvando..."
              : current.kind === "LUNCH"
                ? "Voltei do almoço"
                : "Voltei do banheiro"}
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={disabled}
              onClick={() => void send("BATHROOM")}
              className="rounded-xl border border-(--border-strong) px-4 py-3 font-semibold text-(--text-primary) disabled:opacity-50"
            >
              Pausa banheiro
            </button>

            <button
              type="button"
              disabled={disabled}
              onClick={() => void send("LUNCH")}
              className="primary-button w-full disabled:opacity-50"
            >
              Pausa almoço
            </button>
          </>
        )}
      </div>

      <button
        type="button"
        disabled={loading || busy || workBusy}
        onClick={() => void refresh()}
        className="text-sm font-semibold text-(--brand) disabled:opacity-50"
      >
        Atualizar intervalos
      </button>
    </section>
    {children && (
      <fieldset disabled={disabled || Boolean(current)} className="mt-5 min-w-0">
        <legend className="sr-only">Trabalhos de produção</legend>
        {children}
      </fieldset>
    )}
    </>
  );
}
