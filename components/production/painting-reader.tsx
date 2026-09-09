"use client";

import { useState } from "react";

import { ActiveProduction } from "@/components/production/active-production";
import { CameraScanner } from "@/components/production/camera-scanner";

type ProductionKind = "STANDARD" | "RETURN";

type PaintingReaderProps = {
  employeeName: string;
};

export function PaintingReader({
  employeeName,
}: PaintingReaderProps) {
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<ProductionKind>("STANDARD");
  const [returnReason, setReturnReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [active, setActive] = useState(false);

  const isReturn = kind === "RETURN";

  function handleDetected(detectedCode: string) {
    setCode(detectedCode);
  }

  function handleCodeChange(value: string) {
    const sanitized = value.replace(/\D/g, "").slice(0, 10);

    setCode(sanitized);
  }

  function handleContinue() {
    if (code.length < 4) {
      return;
    }

    if (isReturn && !returnReason.trim()) {
      return;
    }

    setConfirming(true);
  }

  function handleBack() {
    setConfirming(false);
  }

  function handleFinish() {
    setActive(false);
    setConfirming(false);
    setCode("");
    setReturnReason("");
    setKind("STANDARD");
  }

  if (active) {
    return (
      <ActiveProduction
        code={code}
        processName="Pintura"
        employeeName={employeeName}
        productionType={isReturn ? "Retorno" : "Produção normal"}
        onFinish={handleFinish}
      />
    );
  }

  if (confirming) {
    return (
      <div className="space-y-6">
        <section className="rounded-[28px] border border-(--border) bg-(--surface-soft) p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-(--brand)">
            Confirmar produção
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-(--border) bg-(--surface) p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-(--text-muted)">
                Código
              </p>

              <p className="mt-1 text-xl font-semibold text-(--text-primary)">
                {code}
              </p>
            </div>

            <div className="rounded-2xl border border-(--border) bg-(--surface) p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-(--text-muted)">
                Processo
              </p>

              <p className="mt-1 font-semibold text-(--text-primary)">
                Pintura
              </p>
            </div>

            <div className="rounded-2xl border border-(--border) bg-(--surface) p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-(--text-muted)">
                Tipo
              </p>

              <p className="mt-1 font-semibold text-(--text-primary)">
                {isReturn ? "Retorno" : "Produção normal"}
              </p>
            </div>

            <div className="rounded-2xl border border-(--border) bg-(--surface) p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-(--text-muted)">
                Funcionário
              </p>

              <p className="mt-1 font-semibold text-(--text-primary)">
                {employeeName}
              </p>
            </div>
          </div>

          {isReturn && (
            <div className="mt-3 rounded-2xl border border-(--border) bg-(--surface) p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-(--text-muted)">
                Motivo do retorno
              </p>

              <p className="mt-1 text-sm text-(--text-primary)">
                {returnReason}
              </p>
            </div>
          )}
        </section>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={handleBack}
            className="w-full rounded-2xl border border-(--border-strong) px-4 py-3.5 font-semibold text-(--text-primary) transition hover:bg-(--surface-hover)"
          >
            Voltar e corrigir
          </button>

          <button
            type="button"
            onClick={() => {
              setConfirming(false);
              setActive(true);
            }}
            className="w-full rounded-2xl bg-(--brand) px-4 py-3.5 font-semibold text-white transition hover:bg-(--brand-hover)"
          >
            Confirmar e iniciar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-3 text-sm font-medium text-(--text-secondary)">
          Tipo
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setKind("STANDARD")}
            className={`rounded-2xl border px-4 py-4 text-left font-semibold transition ${
              kind === "STANDARD"
                ? "border-(--brand) bg-(--brand-soft) text-(--text-primary)"
                : "border-(--border) bg-(--surface-soft) text-(--text-secondary) hover:bg-(--surface-hover)"
            }`}
          >
            Produção normal
          </button>

          <button
            type="button"
            onClick={() => setKind("RETURN")}
            className={`rounded-2xl border px-4 py-4 text-left font-semibold transition ${
              kind === "RETURN"
                ? "border-(--brand) bg-(--brand-soft) text-(--text-primary)"
                : "border-(--border) bg-(--surface-soft) text-(--text-secondary) hover:bg-(--surface-hover)"
            }`}
          >
            Retorno
          </button>
        </div>
      </div>

      {isReturn && (
        <div>
          <label className="text-sm font-medium text-(--text-secondary)">
            Motivo do retorno
          </label>

          <textarea
            value={returnReason}
            onChange={(event) => setReturnReason(event.target.value)}
            rows={3}
            className="auth-input resize-none"
          />
        </div>
      )}

      <CameraScanner onDetected={handleDetected} />

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
          value={code}
          onChange={(event) => handleCodeChange(event.target.value)}
          className="auth-input"
        />
      </div>

      <button
        type="button"
        onClick={handleContinue}
        disabled={code.length < 4 || (isReturn && !returnReason.trim())}
        className="primary-button w-full"
      >
        Continuar
      </button>
    </div>
  );
}