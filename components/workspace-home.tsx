import Image from "next/image";
import Link from "next/link";

import { LogoutButton } from "@/components/auth/logout-button";
import { EmployeeBreakControl } from "@/components/production/employee-break-control";

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
            className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              !management
                ? "bg-(--brand) text-white"
                : "bg-(--surface) text-(--text-secondary) hover:bg-(--surface-hover)"
            }`}
          >
            Produção
          </Link>

          <Link
            href="/producao/retornos"
            className="whitespace-nowrap rounded-xl bg-(--surface) px-4 py-2.5 text-sm font-semibold text-(--text-secondary) transition hover:bg-(--surface-hover)"
          >
            Meus retornos
          </Link>

          {canAccessManagement && (
            <>
              <Link
                href="/gerencia"
                aria-current={management ? "page" : undefined}
                className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                  management
                    ? "bg-(--brand) text-white"
                    : "bg-(--surface) text-(--text-secondary) hover:bg-(--surface-hover)"
                }`}
              >
                Gerência
              </Link>

              <Link
                href="/gerencia/qualidade"
                className="whitespace-nowrap rounded-xl bg-(--surface) px-4 py-2.5 text-sm font-semibold text-(--text-secondary) transition hover:bg-(--surface-hover)"
              >
                Controle de qualidade
              </Link>
            </>
          )}

          <Link
            href="/trocar-pin"
            className="whitespace-nowrap rounded-xl bg-(--surface) px-4 py-2.5 text-sm font-semibold text-(--text-secondary) transition hover:bg-(--surface-hover)"
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
                ? "Acompanhe os relatórios e os serviços enviados para retrabalho."
                : "Registre seus intervalos e escolha o processo que vai realizar."}
            </p>
          </div>

          {!management && (
            <>
              <EmployeeBreakControl canUseBreaks={!canAccessManagement} />

              <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <article className="flex min-h-55 flex-col rounded-2xl border border-(--border) bg-(--surface-soft) p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-(--text-muted)">
                    Processo
                  </p>

                  <h2 className="mt-2 text-xl font-semibold text-(--text-primary)">
                    Higienização
                  </h2>

                  <p className="mt-2 mb-5 text-sm leading-6 text-(--text-secondary)">
                    Inicie ou continue uma higienização de par completo.
                  </p>

                  <a
                    href="/producao/higienizacao"
                    className="mt-auto w-full rounded-2xl bg-(--brand) px-4 py-3 text-center font-semibold text-white transition hover:bg-(--brand-hover)"
                  >
                    Entrar na higienização
                  </a>
                </article>

                <article className="flex min-h-55 flex-col rounded-2xl border border-(--border) bg-(--surface-soft) p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-(--text-muted)">
                    Processo
                  </p>

                  <h2 className="mt-2 text-xl font-semibold text-(--text-primary)">
                    Finalização
                  </h2>

                  <p className="mt-2 mb-5 text-sm leading-6 text-(--text-secondary)">
                    Trabalhe com finalização de par completo ou de um dos pés.
                  </p>

                  <a
                    href="/producao/finalizacao"
                    className="mt-auto w-full rounded-2xl bg-(--brand) px-4 py-3 text-center font-semibold text-white transition hover:bg-(--brand-hover)"
                  >
                    Entrar na finalização
                  </a>
                </article>

                <article className="flex min-h-55 flex-col rounded-2xl border border-(--border) bg-(--surface-soft) p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-(--text-muted)">
                    Processo
                  </p>

                  <h2 className="mt-2 text-xl font-semibold text-(--text-primary)">
                    Pintura
                  </h2>

                  <p className="mt-2 mb-5 text-sm leading-6 text-(--text-secondary)">
                    Inicie ou continue a pintura de um par quando estiver
                    autorizado.
                  </p>

                  <a
                    href="/producao/pintura"
                    className="mt-auto w-full rounded-2xl bg-(--brand) px-4 py-3 text-center font-semibold text-white transition hover:bg-(--brand-hover)"
                  >
                    Entrar na pintura
                  </a>
                </article>
              </div>

              <article className="mt-6 rounded-2xl border border-(--border) bg-(--surface-soft) p-5">
                <h2 className="text-lg font-semibold text-(--text-primary)">
                  Retornos do controle de qualidade
                </h2>

                <p className="mt-2 text-sm leading-6 text-(--text-secondary)">
                  Confira os serviços atribuídos a você para correção.
                  Retornos não geram nova comissão.
                </p>

                <a
                  href="/producao/retornos"
                  className="mt-4 inline-flex rounded-xl border border-(--brand) px-4 py-3 text-sm font-semibold text-(--brand) transition hover:bg-(--surface-hover)"
                >
                  Acessar meus retornos
                </a>
              </article>
            </>
          )}

          {management && canAccessManagement && (
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <Link
                href="/gerencia"
                className="rounded-2xl border border-(--border) bg-(--surface-soft) p-5 transition hover:bg-(--surface-hover)"
              >
                <h2 className="text-lg font-semibold text-(--text-primary)">
                  Relatórios
                </h2>

                <p className="mt-2 text-sm leading-6 text-(--text-secondary)">
                  Consulte produção, tempos e comissões, com exportação
                  para Excel.
                </p>
              </Link>

              <Link
                href="/gerencia/qualidade"
                className="rounded-2xl border border-(--border) bg-(--surface-soft) p-5 transition hover:bg-(--surface-hover)"
              >
                <h2 className="text-lg font-semibold text-(--text-primary)">
                  Controle de qualidade
                </h2>

                <p className="mt-2 text-sm leading-6 text-(--text-secondary)">
                  Solicite a correção de serviços de Higienização,
                  Finalização e Pintura.
                </p>
              </Link>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
