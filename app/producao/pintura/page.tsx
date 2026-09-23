import Link from "next/link";
import { redirect } from "next/navigation";

import { PaintingReader } from "@/components/production/painting-reader";
import { requirePageAccess } from "@/lib/auth-page";
import {
  getPaintingOverview,
  type PaintingOverview,
} from "@/services/painting.service";
import { ProductionError } from "@/types/production-error.types";

export const dynamic = "force-dynamic";

export default async function PaintingPage() {
  const employee = await requirePageAccess();

  let initialOverview: PaintingOverview;

  try {
    initialOverview = await getPaintingOverview(employee.id);
  } catch (error) {
    if (
      error instanceof ProductionError &&
      error.code === "PROCESS_NOT_AUTHORIZED"
    ) {
      redirect("/producao");
    }

    throw error;
  }

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Link
            href="/producao"
            className="rounded-xl border border-(--border) bg-(--surface) px-4 py-2.5 text-sm font-semibold text-(--text-secondary) transition hover:bg-(--surface-hover)"
          >
            ← Voltar
          </Link>

          <p className="text-sm text-(--text-secondary)">
            {employee.name}
          </p>
        </div>

        <section className="rounded-[28px] border border-(--border) bg-(--surface) p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-(--brand)">
            Produção
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-(--text-primary)">
            Pintura
          </h1>

          <p className="mt-3 text-sm leading-6 text-(--text-secondary)">
            Leia o código da etiqueta pela câmera ou informe manualmente.
            A pintura é registrada por par completo.
          </p>

          <div className="mt-8">
            <PaintingReader
              canUseBreaks={!employee.canAccessManagement}
              employeeName={employee.name}
              initialOverview={initialOverview}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
