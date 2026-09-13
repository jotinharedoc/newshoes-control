"use client";

import { useRef, useState } from "react";

type Candidate = {
  id: string;
  unit: string;
  completedAt: string | null;
  shoe: {
    code: string;
  };
  employee: {
    id: string;
    name: string;
    active: boolean;
  };
  processType: {
    id: string;
    name: string;
    active: boolean;
  };
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

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});

async function errorMessage(response: Response) {
  const payload = (await response
    .json()
    .catch(() => null)) as ApiError | null;

  return (
    payload?.error?.message ??
    "Não foi possível concluir a operação."
  );
}

export function QualityReturnForm() {
  const [code, setCode] = useState("");
  const [searchedCode, setSearchedCode] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [reason, setReason] = useState("");
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const requestInProgress = useRef(false);

  const selected = candidates.find(
    (candidate) => candidate.id === selectedId,
  );

  async function search() {
    if (requestInProgress.current) return;

    const normalized = code.trim();

    if (!/^\d{1,64}$/.test(normalized)) {
      setError("Informe um código com 1 a 64 números.");
      return;
    }

    requestInProgress.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    setSelectedId("");
    setReason("");
    setCandidates([]);
    setSearched(false);

    try {
      const params = new URLSearchParams({
        code: normalized,
      });

      const response = await fetch(
        `/api/production/returns?${params.toString()}`,
        {
          cache: "no-store",
        },
      );

      if (!response.ok) {
        setError(await errorMessage(response));
        return;
      }

      const result = (await response.json()) as Candidate[];

      setCandidates(result);
      setSearchedCode(normalized);
      setSearched(true);
    } catch {
      setError(
        "Não foi possível buscar os serviços. Verifique a conexão.",
      );
    } finally {
      requestInProgress.current = false;
      setBusy(false);
    }
  }

  async function createReturn() {
    if (requestInProgress.current || !selected) return;

    const normalizedReason = reason.trim();

    if (!normalizedReason || normalizedReason.length > 1000) {
      setError("Informe um motivo de até 1.000 caracteres.");
      return;
    }

    requestInProgress.current = true;
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/production/returns", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sourceProductionId: selected.id,
          reason: normalizedReason,
        }),
      });

      if (!response.ok) {
        setError(await errorMessage(response));
        return;
      }

      setNotice(
        `Retorno de ${selected.processType.name} do código ${selected.shoe.code} registrado para ${selected.employee.name}, sem nova comissão.`,
      );

      setSelectedId("");
      setReason("");
    } catch {
      setError(
        "A conexão falhou e não foi possível confirmar o resultado. Confira os registros da gerência antes de tentar novamente.",
      );
    } finally {
      requestInProgress.current = false;
      setBusy(false);
    }
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

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
        className="space-y-4"
      >
        <div>
          <label
            htmlFor="quality-code"
            className="text-sm font-medium text-(--text-secondary)"
          >
            Código do tênis
          </label>

          <input
            id="quality-code"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={64}
            required
            disabled={busy}
            value={code}
            onChange={(event) => {
              setCode(
                event.target.value.replace(/\D/g, "").slice(0, 64),
              );
              setSearched(false);
              setCandidates([]);
              setSelectedId("");
              setReason("");
              setError("");
              setNotice("");
            }}
            className="auth-input"
          />
        </div>

        <button
          type="submit"
          disabled={busy || !/^\d{1,64}$/.test(code)}
          className="primary-button w-full disabled:opacity-50"
        >
          {busy ? "Aguarde..." : "Buscar serviços concluídos"}
        </button>
      </form>

      {searched && candidates.length === 0 && (
        <p className="rounded-xl bg-(--surface-soft) p-4 text-sm text-(--text-secondary)">
          Nenhum serviço normal concluído foi encontrado para o código{" "}
          {searchedCode}.
        </p>
      )}

      {searched && candidates.length > 0 && (
        <fieldset disabled={busy} className="space-y-3">
          <legend className="mb-3 text-lg font-semibold text-(--text-primary)">
            Qual serviço precisa ser refeito?
          </legend>

          {candidates.map((candidate) => {
            const unavailable =
              !candidate.employee.active ||
              !candidate.processType.active;

            const checked = selectedId === candidate.id;

            return (
              <label
                key={candidate.id}
                className={`flex items-start gap-3 rounded-2xl border p-4 ${
                  unavailable
                    ? "cursor-not-allowed opacity-50"
                    : "cursor-pointer"
                } ${
                  checked
                    ? "border-(--brand) bg-(--brand-soft)"
                    : "border-(--border) bg-(--surface-soft)"
                }`}
              >
                <input
                  type="radio"
                  name="sourceProduction"
                  value={candidate.id}
                  checked={checked}
                  disabled={unavailable}
                  onChange={() => {
                    setSelectedId(candidate.id);
                    setReason("");
                    setError("");
                    setNotice("");
                  }}
                  className="mt-1"
                />

                <div>
                  <p className="font-semibold text-(--text-primary)">
                    {candidate.processType.name} ·{" "}
                    {unitLabels[candidate.unit] ?? candidate.unit}
                  </p>

                  <p className="mt-1 text-sm text-(--text-secondary)">
                    Responsável: {candidate.employee.name}
                  </p>

                  <p className="mt-1 text-sm text-(--text-secondary)">
                    Concluído em:{" "}
                    {candidate.completedAt
                      ? dateFormatter.format(
                          new Date(candidate.completedAt),
                        )
                      : "—"}
                  </p>

                  {unavailable && (
                    <p className="mt-2 text-xs text-(--text-secondary)">
                      Funcionário ou processo inativo.
                    </p>
                  )}
                </div>
              </label>
            );
          })}
        </fieldset>
      )}

      {selected && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void createReturn();
          }}
          className="space-y-4 rounded-2xl border border-(--border) bg-(--surface-soft) p-5"
        >
          <h2 className="text-lg font-semibold text-(--text-primary)">
            Solicitar retorno de {selected.processType.name}
          </h2>

          <p className="text-sm leading-6 text-(--text-secondary)">
            O retrabalho será atribuído a {selected.employee.name},
            para o código {selected.shoe.code},{" "}
            {(
              unitLabels[selected.unit] ?? selected.unit
            ).toLowerCase()}
            . Não haverá nova comissão.
          </p>

          <div>
            <label
              htmlFor="quality-reason"
              className="text-sm font-medium text-(--text-secondary)"
            >
              O que precisa ser corrigido?
            </label>

            <textarea
              id="quality-reason"
              required
              maxLength={1000}
              rows={4}
              disabled={busy}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Descreva a falha encontrada no controle de qualidade."
              className="auth-input resize-y"
            />
          </div>

          <button
            type="submit"
            disabled={busy || !reason.trim()}
            className="primary-button w-full disabled:opacity-50"
          >
            {busy ? "Salvando..." : "Confirmar retorno"}
          </button>
        </form>
      )}
    </div>
  );
}