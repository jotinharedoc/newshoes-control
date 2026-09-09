"use client";

type ActiveProductionProps = {
  code: string;
  processName: string;
  employeeName: string;
  productionType: string;
  paused?: boolean;
  onPause?: () => void;
  onResume?: () => void;
  onFinish: () => void;
};

export function ActiveProduction({
  code,
  processName,
  employeeName,
  productionType,
  paused = false,
  onPause,
  onResume,
  onFinish,
}: ActiveProductionProps) {
  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-(--border) bg-(--surface-soft) p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-(--brand)">
          {paused ? "Produção pausada" : "Produção em andamento"}
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
              {processName}
            </p>
          </div>

          <div className="rounded-2xl border border-(--border) bg-(--surface) p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-(--text-muted)">
              Tipo
            </p>

            <p className="mt-1 font-semibold text-(--text-primary)">
              {productionType}
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
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={paused ? onResume : onPause}
          className="w-full rounded-2xl border border-(--border-strong) bg-(--surface-soft) px-4 py-3.5 font-semibold text-(--text-primary) transition hover:bg-(--surface-hover)"
        >
          {paused ? "Retomar" : "Pausar"}
        </button>

        <button
          type="button"
          onClick={onFinish}
          className="w-full rounded-2xl bg-(--brand) px-4 py-3.5 font-semibold text-white transition hover:bg-(--brand-hover)"
        >
          Finalizar
        </button>
      </div>
    </div>
  );
}