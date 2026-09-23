import Link from "next/link";
import { ProductivityPanel } from "@/components/management/productivity-panel";

import { LogoutButton } from "@/components/auth/logout-button";
import { requirePageAccess } from "@/lib/auth-page";
import { getManagementDashboard } from "@/services/management.service";
import { MANAGEMENT_PERMISSION } from "@/utils/access";

export const dynamic = "force-dynamic";

type SearchParams = {
  start?: string | string[];
  end?: string | string[];
  employeeId?: string | string[];
  processTypeId?: string | string[];
};

const timeZone = "America/Sao_Paulo";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone,
  dateStyle: "short",
  timeStyle: "short",
});

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const statusLabels: Record<string, string> = {
  IN_PROGRESS: "Em andamento",
  PAUSED: "Pausado",
  DEFERRED: "Adiado",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
};

const unitLabels: Record<string, string> = {
  PAIR: "Par completo",
  LEFT_FOOT: "Pé esquerdo",
  RIGHT_FOOT: "Pé direito",
};

function single(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

function todayInBrazil() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}`;
}

function parseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const calendarDate = new Date(`${value}T00:00:00Z`);

  if (
    !Number.isFinite(calendarDate.getTime()) ||
    calendarDate.toISOString().slice(0, 10) !== value
  ) {
    return null;
  }

  return new Date(`${value}T00:00:00-03:00`);
}

function duration(milliseconds: number) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(
    seconds,
  ).padStart(2, "0")}s`;
}

function money(cents: number) {
  return currencyFormatter.format(cents / 100);
}

const panel =
  "rounded-2xl border border-(--border) bg-(--surface) p-5";

const input =
  "mt-2 w-full rounded-xl border border-(--border-strong) bg-(--surface-soft) px-3 py-3 text-sm text-(--text-primary)";

export default async function ManagementPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const employee = await requirePageAccess(MANAGEMENT_PERMISSION);
  const params = await searchParams;

  const today = todayInBrazil();
  const startValue = single(params.start) || today;
  const endValue = single(params.end) || today;
  const employeeId = single(params.employeeId);
  const processTypeId = single(params.processTypeId);

  const start = parseDate(startValue);
  const end = parseDate(endValue);

  const validPeriod =
    start !== null &&
    end !== null &&
    start.getTime() <= end.getTime() &&
    end.getTime() - start.getTime() < 366 * 24 * 60 * 60 * 1000;

  const data =
    validPeriod && start && end
      ? await getManagementDashboard({
          start,
          endExclusive: new Date(end.getTime() + 24 * 60 * 60 * 1000),
          employeeId: employeeId || undefined,
          processTypeId: processTypeId || undefined,
        })
      : null;

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-(--border) pb-5">
          <div>
            <p className="text-sm font-semibold tracking-widest text-(--brand)">
              NEWSHOES CONTROL
            </p>

            <h1 className="mt-2 text-3xl font-semibold text-(--text-primary)">
              Gerência
            </h1>

            <p className="mt-2 text-sm text-(--text-secondary)">
              Olá, {employee.name}
            </p>
          </div>

          <LogoutButton />
        </header>

        <nav className="flex flex-wrap gap-3 text-sm font-semibold">
          <Link href="/producao" className="text-(--text-secondary)">
            Produção
          </Link>

          <Link
            href="/gerencia"
            aria-current="page"
            className="text-(--brand)"
          >
            Gerência
          </Link>
          <Link
            href="/gerencia/qualidade"
            className="text-(--text-secondary)"
          >
            Controle de qualidade
          </Link>
          <Link href="/trocar-pin" className="text-(--text-secondary)">
            Alterar PIN
          </Link>
        </nav>

        <section className={panel}>
          <h2 className="text-lg font-semibold text-(--text-primary)">
            Período do relatório
          </h2>

          <p className="mt-2 text-sm text-(--text-secondary)">
            Selecione Todos para consultar a equipe inteira ou escolha um
            funcionário para consultar sua produção individual.
          </p>

          <form
            action="/gerencia"
            method="get"
            className="mt-4 space-y-4"
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-sm text-(--text-secondary)">
                Data inicial
                <input
                  type="date"
                  name="start"
                  required
                  defaultValue={startValue}
                  className={input}
                />
              </label>

              <label className="text-sm text-(--text-secondary)">
                Data final
                <input
                  type="date"
                  name="end"
                  required
                  defaultValue={endValue}
                  className={input}
                />
              </label>

              <label className="text-sm text-(--text-secondary)">
                Funcionário
                <select
                  name="employeeId"
                  defaultValue={employeeId}
                  className={input}
                >
                  <option value="">Todos — relatório geral</option>

                  {data?.filterOptions.employees.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {!item.active ? " (inativo)" : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-(--text-secondary)">
                Processo
                <select
                  name="processTypeId"
                  defaultValue={processTypeId}
                  className={input}
                >
                  <option value="">Todos os processos</option>

                  {data?.filterOptions.processes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {!item.active ? " (inativo)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="submit"
                className="rounded-xl bg-(--brand) px-5 py-3 font-semibold text-white transition hover:bg-(--brand-hover)"
              >
                Atualizar relatório
              </button>

              <button
                type="submit"
                formAction="/api/management/export"
                className="rounded-xl border border-(--brand) px-5 py-3 font-semibold text-(--brand) transition hover:bg-(--surface-hover)"
              >
                Exportar Excel
              </button>
            </div>
          </form>

          <p className="mt-3 text-xs text-(--text-muted)">
            Horário de Brasília. Selecione até 366 dias por consulta.
            O Excel utiliza os filtros selecionados no formulário.
          </p>
        </section>

        {!data ? (
          <p role="alert" className={panel}>
            Período inválido. Confira as datas ou{" "}
            <Link href="/gerencia" className="underline">
              volte ao relatório de hoje
            </Link>
            .
          </p>
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["Pares concluídos", data.totals.completedPairs],
                ["Pés avulsos concluídos", data.totals.completedSingleFeet],
                ["Retornos concluídos", data.totals.completedReturns],
                [
                  "Produções com continuação",
                  data.totals.productionsWithContinuation,
                ],
                ["Tempo trabalhado", duration(data.totals.workedMs)],
                [
                  "Comissão lançada",
                  money(data.totals.earnedCommissionCents),
                ],
              ].map(([label, value]) => (
                <article key={String(label)} className={panel}>
                  <p className="text-sm text-(--text-secondary)">
                    {label}
                  </p>

                  <p className="mt-2 text-2xl font-semibold text-(--text-primary)">
                    {value}
                  </p>
                </article>
              ))}
            </section>

            <p className="text-sm leading-6 text-(--text-secondary)">
              As quantidades representam serviços: o mesmo par pode contar
              em higienização, finalização e pintura. Retornos ficam separados.
              Os tempos e as comissões consideram somente o período escolhido.
            </p>

            <ProductivityPanel metrics={data.metrics} />

            {[
              { title: "Por funcionário", groups: data.byEmployee },
              { title: "Por processo", groups: data.byProcess },
            ].map(({ title, groups }) => (
              <section key={title} className={panel}>
                <h2 className="text-lg font-semibold text-(--text-primary)">
                  {title}
                </h2>

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-(--text-secondary)">
                      <tr>
                        {[
                          "Nome",
                          "Pares",
                          "Pés avulsos",
                          "Retornos",
                          "Continuações",
                          "Tempo",
                          "Comissão",
                        ].map((heading) => (
                          <th
                            key={heading}
                            scope="col"
                            className="whitespace-nowrap px-3 py-3"
                          >
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody className="text-(--text-primary)">
                      {groups.map((group) => (
                        <tr
                          key={group.id}
                          className="border-t border-(--border)"
                        >
                          <td className="px-3 py-3">{group.name}</td>

                          <td className="px-3 py-3">
                            {group.completedPairs}
                          </td>

                          <td className="px-3 py-3">
                            {group.completedSingleFeet}
                          </td>

                          <td className="px-3 py-3">
                            {group.completedReturns}
                          </td>

                          <td className="px-3 py-3">
                            {group.productionsWithContinuation}
                          </td>

                          <td className="whitespace-nowrap px-3 py-3">
                            {duration(group.workedMs)}
                          </td>

                          <td className="whitespace-nowrap px-3 py-3">
                            {money(group.earnedCommissionCents)}
                          </td>
                        </tr>
                      ))}

                      {groups.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-3 py-5">
                            Nenhuma atividade no período selecionado.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}

            <section className={panel}>
              <h2 className="text-lg font-semibold text-(--text-primary)">
                Registros de produção
              </h2>

              <p className="mt-2 text-sm text-(--text-secondary)">
                Inclui registros com atividade no período. O status exibido
                é o atual.
              </p>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-(--text-secondary)">
                    <tr>
                      {[
                        "Código",
                        "Funcionário",
                        "Processo",
                        "Unidade",
                        "Tipo",
                        "Status",
                        "Início",
                        "Conclusão",
                        "Tempo no período",
                        "Comissão no período",
                      ].map((heading) => (
                        <th
                          key={heading}
                          scope="col"
                          className="whitespace-nowrap px-3 py-3"
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody className="text-(--text-primary)">
                    {data.rows.map((row) => (
                      <tr
                        key={row.id}
                        className="border-t border-(--border)"
                      >
                        <td className="px-3 py-3 font-semibold">
                          {row.code}
                        </td>

                        <td className="px-3 py-3">
                          {row.employeeName}
                        </td>

                        <td className="px-3 py-3">
                          {row.processName}
                        </td>

                        <td className="whitespace-nowrap px-3 py-3">
                          {unitLabels[row.unit] ?? row.unit}
                        </td>

                        <td className="min-w-40 px-3 py-3">
                          <p>
                            {row.kind === "RETURN" ? "Retorno" : "Normal"}
                          </p>

                          {row.continuationInPeriod && (
                            <p className="text-xs text-(--brand)">
                              Com continuação no período
                            </p>
                          )}

                          {row.returnReason && (
                            <p className="mt-1 text-xs text-(--text-secondary)">
                              Motivo: {row.returnReason}
                            </p>
                          )}

                          {row.originalEmployeeName && (
                            <p className="mt-1 text-xs text-(--text-secondary)">
                              Responsável original: {row.originalEmployeeName}
                            </p>
                          )}
                        </td>

                        <td className="whitespace-nowrap px-3 py-3">
                          {statusLabels[row.status] ?? row.status}
                        </td>

                        <td className="whitespace-nowrap px-3 py-3">
                          {dateFormatter.format(new Date(row.startedAt))}
                        </td>

                        <td className="whitespace-nowrap px-3 py-3">
                          {row.completedAt
                            ? dateFormatter.format(new Date(row.completedAt))
                            : "—"}
                        </td>

                        <td className="whitespace-nowrap px-3 py-3">
                          {duration(row.workedMs)}
                        </td>

                        <td className="whitespace-nowrap px-3 py-3">
                          {money(row.earnedCommissionCents)}
                        </td>
                      </tr>
                    ))}

                    {data.rows.length === 0 && (
                      <tr>
                        <td colSpan={10} className="px-3 py-5">
                          Nenhum registro encontrado.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className={panel}>
              <h2 className="text-lg font-semibold text-(--text-primary)">
                Intervalos de banheiro e almoço
              </h2>

              <p className="mt-2 text-sm text-(--text-secondary)">
                Banheiro: {duration(data.totalBathroomMs)} · Almoço: {duration(data.totalLunchMs)} · Total: {duration(data.totalBreakMs)}. Estes
                intervalos seguem o filtro de funcionário, independentemente
                do processo escolhido.
              </p>

              <div className="mt-4 space-y-3">
                {data.breaks.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap justify-between gap-2 border-t border-(--border) pt-3 text-sm text-(--text-primary)"
                  >
                    <span>
                      {item.employeeName} ·{" "}
                      {item.kind === "BATHROOM" ? "Banheiro" : "Almoço"} ·{" "}
                      {dateFormatter.format(new Date(item.startedAt))}
                      {" → "}
                      {item.endedAt
                        ? dateFormatter.format(new Date(item.endedAt))
                        : "Em aberto"}
                    </span>

                    <span>{duration(item.durationMs)}</span>
                  </div>
                ))}

                {data.breaks.length === 0 && (
                  <p className="text-sm text-(--text-secondary)">
                    Nenhum intervalo registrado no período.
                  </p>
                )}
              </div>
            </section>

            <p className="text-xs text-(--text-muted)">
              Atualizado em{" "}
              {dateFormatter.format(new Date(data.generatedAt))}.
              Use “Atualizar relatório” para renovar os dados e tempos.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
