"use client";

import { ActiveProduction } from "@/components/production/active-production";
import { useState } from "react";

import { CameraScanner } from "@/components/production/camera-scanner";

type CodeReaderProps = {
  employeeName: string;
  processName: string;
};

type ProductionKind = "STANDARD" | "RETURN";

export function CodeReader({
  employeeName,
  processName,
}: CodeReaderProps) {
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<ProductionKind>("STANDARD");
  const [returnReason, setReturnReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [active, setActive] = useState(false);

  const isReturn = kind === "RETURN";

  function handleDetected(detectedCode: string) {
    setCode(detectedCode);
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

  function handleKindChange(nextKind: ProductionKind) {
    setKind(nextKind);
    setConfirming(false);

    if (nextKind === "STANDARD") {
      setReturnReason("");
    }
  }

if (active) {
  return (
    <ActiveProduction
      code={code}
      processName={processName}
      employeeName={employeeName}
      productionType={isReturn ? "Retorno" : "Produção normal"}
      onFinish={() => {
        setActive(false);
        setConfirming(false);
        setCode("");
        setReturnReason("");
        setKind("STANDARD");
      }}
    />
  );
}

  if (confirming) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-(--border) bg-(--surface-soft) p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-(--brand)">
            Confirmar produção
          </p>

          <h2 className="mt-2 text-2xl font-semibold text-(--text-primary)">
            Confira os dados
          </h2>

          <p className="mt-2 text-sm leading-6 text-(--text-secondary)">
            Verifique as informações antes de iniciar.
          </p>

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
                  {processName}
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
            </div>

            <div className="rounded-2xl border border-(--border) bg-(--surface) p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-(--text-muted)">
                Funcionário
              </p>

              <p className="mt-1 font-semibold text-(--text-primary)">
                {employeeName}
              </p>
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
          </div>
        </div>

        <button
  type="button"
  onClick={() => setActive(true)}
  className="w-full rounded-2xl bg-(--brand) px-4 py-3.5 font-semibold text-white transition hover:bg-(--brand-hover)"
>
  Confirmar e iniciar
</button>

       <button
  type="button"
  onClick={handleBack}
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

        <div className="mt-3 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => handleKindChange("STANDARD")}
            className={`rounded-2xl border p-4 text-left transition ${
              kind === "STANDARD"
                ? "border-(--brand) bg-(--brand-soft)"
                : "border-(--border) bg-(--surface-soft) hover:bg-(--surface-hover)"
            }`}
          >
            <p className="font-semibold text-(--text-primary)">
              Produção normal
            </p>

            <p className="mt-1 text-xs leading-5 text-(--text-secondary)">
            </p>
          </button>

          <button
            type="button"
            onClick={() => handleKindChange("RETURN")}
            className={`rounded-2xl border p-4 text-left transition ${
              kind === "RETURN"
                ? "border-amber-400 bg-amber-500/10"
                : "border-(--border) bg-(--surface-soft) hover:bg-(--surface-hover)"
            }`}
          >
            <p className="font-semibold text-(--text-primary)">
              Retorno
            </p>

            <p className="mt-1 text-xs leading-5 text-(--text-secondary)">
            </p>
          </button>
        </div>
      </div>

      {isReturn && (
        <div>
          <label
            htmlFor="return-reason"
            className="text-sm font-medium text-(--text-primary)"
          >
            Motivo do retorno
          </label>

          <textarea
            id="return-reason"
            name="returnReason"
            value={returnReason}
            onChange={(event) => setReturnReason(event.target.value)}
            rows={3}
            className="auth-input resize-none"
          />

          <p className="mt-2 text-sm text-(--text-muted)">
          </p>
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
          htmlFor="shoe-code"
          className="text-sm font-medium text-(--text-primary)"
        >
          Código do tênis
        </label>

        <input
          id="shoe-code"
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

        <p className="mt-2 text-sm text-(--text-muted)">
          Leia pela câmera ou digite o código manualmente.
        </p>
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