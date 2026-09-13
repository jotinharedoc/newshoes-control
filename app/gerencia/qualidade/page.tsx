import Link from "next/link";

import { QualityReturnForm } from "@/components/management/quality-return-form";
import { requirePageAccess } from "@/lib/auth-page";
import { MANAGEMENT_PERMISSION } from "@/utils/access";

export const dynamic = "force-dynamic";

export default async function QualityPage() {
  const employee = await requirePageAccess(MANAGEMENT_PERMISSION);

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/gerencia"
            className="rounded-xl border border-(--border) bg-(--surface) px-4 py-2.5 text-sm font-semibold text-(--text-secondary)"
          >
            ← Voltar à gerência
          </Link>

          <p className="text-sm text-(--text-secondary)">
            {employee.name}
          </p>
        </header>

        <section className="rounded-[28px] border border-(--border) bg-(--surface) p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-(--brand)">
            NEWSHOES CONTROL
          </p>

          <h1 className="mt-2 text-3xl font-semibold text-(--text-primary)">
            Controle de qualidade
          </h1>

          <p className="mt-3 text-sm leading-6 text-(--text-secondary)">
            Registre os serviços que precisam ser refeitos após a
            conferência interna. O retorno fica vinculado ao serviço
            original e será executado pelo mesmo responsável, sem
            nova comissão.
          </p>

          <div className="mt-8">
            <QualityReturnForm />
          </div>
        </section>
      </div>
    </main>
  );
}