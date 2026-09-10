"use client";

type ActiveProductionProps = {
  code: string;
  processName: string;
  employeeName: string;
  productionType?: string;
  elapsedTime?: string;
  paused?: boolean;
  pending?: boolean;
  onPause?: () => void;
  onResume?: () => void;
  onDefer?: () => void;
  onFinish: () => void;
  onStartNext?: () => void;
};

export function ActiveProduction({
  code,
  processName,
  employeeName,
  productionType,
  elapsedTime,
  paused = false,
  pending = false,
  onPause,
  onResume,
  onDefer,
  onFinish,
  onStartNext,
}: ActiveProductionProps) {
  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-(--border) bg-(--surface-soft) p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-(--brand)">
          {paused ? "Produção pausada" : "Produção em andamento"}
        </p>
        {elapsedTime && (
          <>
            <p className="mt-3 font-mono text-4xl font-semibold tabular-nums text-(--text-primary)">
              {elapsedTime}
            </p>
            <p className="mt-1 text-xs text-(--text-muted)">Tempo efetivamente trabalhado</p>
          </>
        )}

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-(--border) bg-(--surface) p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-(--text-muted)">Código</p>
            <p className="mt-1 text-xl font-semibold text-(--text-primary)">{code}</p>
          </div>
          <div className="rounded-2xl border border-(--border) bg-(--surface) p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-(--text-muted)">Processo</p>
            <p className="mt-1 font-semibold text-(--text-primary)">{processName}</p>
          </div>
          {productionType && (
            <div className="rounded-2xl border border-(--border) bg-(--surface) p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-(--text-muted)">Tipo</p>
              <p className="mt-1 font-semibold text-(--text-primary)">{productionType}</p>
            </div>
          )}
          <div className="rounded-2xl border border-(--border) bg-(--surface) p-4 sm:col-span-2">
            <p className="text-xs uppercase tracking-[0.16em] text-(--text-muted)">Funcionário</p>
            <p className="mt-1 font-semibold text-(--text-primary)">{employeeName}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        {(onPause || onResume) && (
          <button type="button" onClick={paused ? onResume : onPause} disabled={pending} className="w-full rounded-2xl border border-(--border-strong) bg-(--surface-soft) px-4 py-3.5 font-semibold text-(--text-primary) transition hover:bg-(--surface-hover) disabled:opacity-50">
            {paused ? "Continuar agora" : "Pausar"}
          </button>
        )}
        {onDefer && (
          <button type="button" onClick={onDefer} disabled={pending} className="w-full rounded-2xl border border-(--border-strong) bg-(--surface-soft) px-4 py-3.5 font-semibold text-(--text-primary) transition hover:bg-(--surface-hover) disabled:opacity-50">
            Deixar para depois
          </button>
        )}
        {onStartNext && (
          <button type="button" onClick={onStartNext} disabled={pending} className="w-full rounded-2xl border border-(--brand) bg-(--brand-soft) px-4 py-3.5 font-semibold text-(--brand) transition hover:bg-(--surface-hover) disabled:opacity-50">
            Finalizar e iniciar outro
          </button>
        )}
        <button type="button" onClick={onFinish} disabled={pending} className="w-full rounded-2xl bg-(--brand) px-4 py-3.5 font-semibold text-white transition hover:bg-(--brand-hover) disabled:opacity-50">
          Finalizar
        </button>
      </div>
    </div>
  );
}
