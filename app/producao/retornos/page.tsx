import Link from "next/link";

import { ReturnReader } from "@/components/production/return-reader";
import { requirePageAccess } from "@/lib/auth-page";
import { getEmployeeReturns } from "@/services/return.service";

export const dynamic = "force-dynamic";

export default async function ReturnsPage() {
  const employee = await requirePageAccess();
  const initialReturns = await getEmployeeReturns(employee.id);

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/producao"
            className="rounded-xl border border-(--border) bg-(--surface) px-4 py-2.5 text-sm font-semibold text-(--text-secondary)"
          >
            ← Voltar à produção
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
            Meus retornos
          </h1>

          <p className="mt-3 text-sm leading-6 text-(--text-secondary)">
            Confira os ajustes solicitados pelo controle de qualidade.
            Inicie o retorno quando começar o retrabalho e pause quando
            interromper a execução.
          </p>

          <div className="mt-8">
            <ReturnReader initialReturns={initialReturns} canUseBreaks={!employee.canAccessManagement} />
          </div>
        </section>
      </div>
    </main>
  );
}
