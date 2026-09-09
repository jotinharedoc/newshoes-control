"use client";

import { ActiveProduction } from "@/components/production/active-production";
import { useState } from "react";

import { CameraScanner } from "@/components/production/camera-scanner";

type FinalizationType = "PAIR" | "LEFT_FOOT" | "RIGHT_FOOT";
type ProductionKind = "STANDARD" | "RETURN" | "CONTINUATION";

type FinalizationReaderProps = {
  employeeName: string;
};

const finalizationOptions: {
  value: FinalizationType;
  label: string;
}[] = [
  {
    value: "PAIR",
    label: "Par completo",
  },
  {
    value: "LEFT_FOOT",
    label: "Pé esquerdo",
  },
  {
    value: "RIGHT_FOOT",
    label: "Pé direito",
  },
];

export function FinalizationReader({
  employeeName,
}: FinalizationReaderProps) {
  const [code, setCode] = useState("");
  const [type, setType] = useState<FinalizationType>("PAIR");
  const [kind, setKind] = useState<ProductionKind>("STANDARD");
  const [returnReason, setReturnReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [active, setActive] = useState(false);

  const isReturn = kind === "RETURN";
  const isContinuation = kind === "CONTINUATION";

  function handleDetected(detectedCode: string) {
    setCode(detectedCode);
  }

  function handleKindChange(nextKind: ProductionKind) {
    setKind(nextKind);
    setConfirming(false);

    if (nextKind !== "RETURN") {
      setReturnReason("");
    }
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

  if (active) {
  const selectedOption = finalizationOptions.find(
    (option) => option.value === type,
  );

  return (
    <ActiveProduction
      code={code}
      processName="Finalização"
      employeeName={employeeName}
      productionType={
        kind === "RETURN"
          ? `Retorno · ${selectedOption?.label}`
          : kind === "CONTINUATION"
            ? `Continuação · ${selectedOption?.label}`
            : selectedOption?.label ?? "Produção normal"
      }
      onFinish={() => {
        setActive(false);
        setConfirming(false);
        setCode("");
        setReturnReason("");
        setKind("STANDARD");
        setType("PAIR");
      }}
    />
  );
}

  if (confirming) {
    const selectedOption = finalizationOptions.find(
      (option) => option.value === type,
    );

    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-(--border) bg-(--surface-soft) p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-(--brand)">
            Confirmar produção
          </p>

          <h2 className="mt-2 text-2xl font-semibold text-(--text-primary)">
            Confira os dados
          </h2>

          <div className="mt-6 space-y-3">
            <div className="rounded-2xl border border-(--border) bg-(--surface) p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-(--text-muted)">
                Código
              </p>

              <p className="mt-1 text-2xl font-semibold tracking-wide text-(--text-primary)">
                {code}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-(--border) bg-(--surface) p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-(--text-muted)">
                  Processo
                </p>

                <p className="mt-1 font-semibold text-(--text-primary)">
                  Finalização
                </p>
              </div>

              <div className="rounded-2xl border border-(--border) bg-(--surface) p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-(--text-muted)">
                  Tipo
                </p>

                <p className="mt-1 font-semibold text-(--text-primary)">
                  {kind === "RETURN"
                    ? "Retorno"
                    : kind === "CONTINUATION"
                      ? "Continuação"
                      : "Produção normal"}
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-(--border) bg-(--surface) p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-(--text-muted)">
                  Parte
                </p>

                <p className="mt-1 font-semibold text-(--text-primary)">
                  {selectedOption?.label}
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
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-amber-400">
                  Motivo do retorno
                </p>

                <p className="mt-2 text-sm leading-6 text-(--text-primary)">
                  {returnReason}
                </p>
              </div>
            )}

            {isContinuation && (
              <div className="rounded-2xl border border-(--brand) bg-(--brand-soft) p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-(--brand)">
                  Continuação
                </p>

                <p className="mt-2 text-sm text-(--text-primary)">
                  Retomada de uma finalização já iniciada.
                </p>
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          className="w-full rounded-2xl bg-(--brand) px-4 py-3.5 font-semibold text-white transition hover:bg-(--brand-hover)"
        >
          Confirmar e iniciar
        </button>

        <button
     type="button"
  onClick={() => setConfirming(false)}
  className="w-full rounded-2xl border border-(--border-strong) px-4 py-3.5 font-semibold text-(--text-primary) transition hover:bg-(--surface-hover)"
>
  Voltar e corrigir
</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-(--text-primary)">
          Tipo do serviço
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => handleKindChange("STANDARD")}
            className={`rounded-2xl border p-4 text-center transition ${
              kind === "STANDARD"
                ? "border-(--brand) bg-(--brand-soft)"
                : "border-(--border) bg-(--surface-soft) hover:bg-(--surface-hover)"
            }`}
          >
            <p className="font-semibold text-(--text-primary)">
              Produção normal
            </p>
          </button>

          <button
            type="button"
            onClick={() => handleKindChange("RETURN")}
            className={`rounded-2xl border p-4 text-center transition ${
              kind === "RETURN"
                ? "border-amber-400 bg-amber-500/10"
                : "border-(--border) bg-(--surface-soft) hover:bg-(--surface-hover)"
            }`}
          >
            <p className="font-semibold text-(--text-primary)">
              Retorno
            </p>
          </button>

          <button
            type="button"
            onClick={() => handleKindChange("CONTINUATION")}
            className={`rounded-2xl border p-4 text-center transition ${
              kind === "CONTINUATION"
                ? "border-(--brand) bg-(--brand-soft)"
                : "border-(--border) bg-(--surface-soft) hover:bg-(--surface-hover)"
            }`}
          >
            <p className="font-semibold text-(--text-primary)">
              Continuação
            </p>
          </button>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-(--text-primary)">
          Tipo de finalização
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {finalizationOptions.map((option) => {
            const selected = type === option.value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setType(option.value)}
                className={`rounded-2xl border p-4 text-center transition ${
                  selected
                    ? "border-(--brand) bg-(--brand-soft)"
                    : "border-(--border) bg-(--surface-soft) hover:bg-(--surface-hover)"
                }`}
              >
                <p className="font-semibold text-(--text-primary)">
                  {option.label}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {isReturn && (
        <div>
          <label
            htmlFor="finalization-return-reason"
            className="text-sm font-medium text-(--text-primary)"
          >
            Motivo do retorno
          </label>

          <textarea
            id="finalization-return-reason"
            name="returnReason"
            value={returnReason}
            onChange={(event) => setReturnReason(event.target.value)}
            rows={3}
            className="auth-input resize-none"
          />
        </div>
      )}

      <CameraScanner onDetected={handleDetected} />

      <div className="flex items-center gap-4">
        <div className="h-px flex-1 bg-(--border)" />

        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-(--text-muted)">
          ou
        </span>

        <div className="h-px flex-1 bg-(--border)" />
      </div>

      <div>
        <label
          htmlFor="finalization-code"
          className="text-sm font-medium text-(--text-primary)"
        >
          Código do tênis
        </label>

        <input
          id="finalization-code"
          name="shoeCode"
          type="text"
          inputMode="numeric"
          pattern="[0-9]+"
          maxLength={10}
          value={code}
          onChange={(event) => {
            const value = event.target.value
              .replace(/\D/g, "")
              .slice(0, 10);

            setCode(value);
          }}
          placeholder="Ex.: 1001693"
          className="auth-input"
        />
      </div>

      <button
        type="button"
        onClick={handleContinue}
        disabled={
          code.length < 4 ||
          (isReturn && !returnReason.trim())
        }
        className="w-full rounded-2xl bg-(--brand) px-4 py-3.5 font-semibold text-white transition hover:bg-(--brand-hover) disabled:cursor-not-allowed disabled:opacity-50"
      >
        Continuar
      </button>
    </div>
  );
}