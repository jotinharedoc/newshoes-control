import Image from "next/image";
import Link from "next/link";

import { LogoutButton } from "@/components/auth/logout-button";

type WorkspaceHomeProps = {
  name: string;
  management: boolean;
  canAccessManagement: boolean;
};

export function WorkspaceHome({
  name,
  management,
  canAccessManagement,
}: WorkspaceHomeProps) {
  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <header className="flex flex-col gap-5 border-b border-(--border) pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Image
              src="/newshoes-logo.png"
              alt="New Shoes"
              width={180}
              height={64}
              className="h-auto w-40"
            />

            <span className="hidden text-xs font-semibold uppercase tracking-[0.24em] text-(--brand) sm:inline">
              Control
            </span>
          </div>

          <div className="flex items-center justify-between gap-4 sm:justify-end">
            <div className="text-right">
              <p className="text-xs uppercase tracking-[0.18em] text-(--text-muted)">
                Usuário
              </p>

              <p className="mt-1 text-sm font-semibold text-(--text-primary)">
                {name}
              </p>
            </div>

            <LogoutButton />
          </div>
        </header>

        <nav
          aria-label="Navegação principal"
          className="flex gap-2 overflow-x-auto py-5"
        >
          <Link
            href="/producao"
            aria-current={!management ? "page" : undefined}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              !management
                ? "bg-(--brand) text-white"
                : "bg-(--surface) text-(--text-secondary) hover:bg-(--surface-hover)"
            }`}
          >
            Produção
          </Link>

          {canAccessManagement && (
            <Link
              href="/gerencia"
              aria-current={management ? "page" : undefined}
              className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                management
                  ? "bg-(--brand) text-white"
                  : "bg-(--surface) text-(--text-secondary) hover:bg-(--surface-hover)"
              }`}
            >
              Gerência
            </Link>
          )}

          <Link
            href="/trocar-pin"
            className="rounded-xl bg-(--surface) px-4 py-2.5 text-sm font-semibold text-(--text-secondary) transition hover:bg-(--surface-hover)"
          >
            Alterar PIN
          </Link>
        </nav>

        <section className="rounded-[28px] border border-(--border) bg-(--surface) p-6 sm:p-8">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold text-(--brand)">
              Olá, {name}
            </p>

            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-(--text-primary) sm:text-4xl">
              {management ? "Gerência" : "Área de produção"}
            </h1>

            <p className="mt-4 text-sm leading-6 text-(--text-secondary) sm:text-base">
              {management
                ? "Acompanhe a operação, indicadores e configurações do sistema."
                : "Escolha o processo que você vai realizar para começar."}
            </p>
          </div>

          {!management && (
            <>
              <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <article className="flex min-h-55 flex-col rounded-2xl border border-(--border) bg-(--surface-soft) p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-(--text-muted)">
                    Processo
                  </p>

                  <h2 className="mt-2 text-xl font-semibold text-(--text-primary)">
                    Higienização
                  </h2>

                  <p className="mt-2 text-sm leading-6 text-(--text-secondary)">
                    Inicie uma nova higienização de par completo.
                  </p>

                  <Link
                    href="/producao/higienizacao"
                    className="mt-auto w-full rounded-2xl bg-(--brand) px-4 py-3 text-center font-semibold text-white transition hover:bg-(--brand-hover)"
                  >
                    Entrar na higienização
                  </Link>
                </article>

                <article className="flex min-h-55 flex-col rounded-2xl border border-(--border) bg-(--surface-soft) p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-(--text-muted)">
                    Processo
                  </p>

                  <h2 className="mt-2 text-xl font-semibold text-(--text-primary)">
                    Finalização
                  </h2>

                  <p className="mt-2 text-sm leading-6 text-(--text-secondary)">
                    Trabalhe com finalização de par completo ou de um dos pés.
                  </p>

                  <Link
                    href="/producao/finalizacao"
                    className="mt-auto w-full rounded-2xl bg-(--brand) px-4 py-3 text-center font-semibold text-white transition hover:bg-(--brand-hover)"
                  >
                    Entrar na finalização
                  </Link>
                </article>

                <article className="flex min-h-55 flex-col rounded-2xl border border-(--border) bg-(--surface-soft) p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-(--text-muted)">
                    Processo
                  </p>

                  <h2 className="mt-2 text-xl font-semibold text-(--text-primary)">
                    Pintura
                  </h2>

                  <p className="mt-2 text-sm leading-6 text-(--text-secondary)">
                    Acesse o fluxo de pintura quando estiver autorizado.
                  </p>

                  <Link
                    href="/producao/pintura"
                    className="mt-auto w-full rounded-2xl border border-(--border-strong) bg-transparent px-4 py-3 text-center font-semibold text-(--text-primary) transition hover:bg-(--surface-hover)"
                  >
                    Entrar na pintura
                  </Link>
                </article>
              </div>

              <div className="mt-6 rounded-2xl border border-dashed border-(--border-strong) bg-(--surface-soft) p-5">
                <p className="text-sm font-semibold text-(--text-primary)">
                  Nenhuma produção em andamento
                </p>

                <p className="mt-2 text-sm leading-6 text-(--text-secondary)">
                  Quando um processo for iniciado, o código do tênis, o tempo e
                  as ações da produção aparecerão aqui.
                </p>
              </div>
            </>
          )}

          {management && (
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <article className="rounded-2xl border border-(--border) bg-(--surface-soft) p-5">
                <p className="text-sm text-(--text-secondary)">Produção hoje</p>
                <p className="mt-2 text-3xl font-semibold text-(--text-primary)">
                  —
                </p>
              </article>

              <article className="rounded-2xl border border-(--border) bg-(--surface-soft) p-5">
                <p className="text-sm text-(--text-secondary)">Em andamento</p>
                <p className="mt-2 text-3xl font-semibold text-(--text-primary)">
                  —
                </p>
              </article>

              <article className="rounded-2xl border border-(--border) bg-(--surface-soft) p-5">
                <p className="text-sm text-(--text-secondary)">Retornos</p>
                <p className="mt-2 text-3xl font-semibold text-(--text-primary)">
                  —
                </p>
              </article>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}