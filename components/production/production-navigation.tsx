import Link from "next/link";

export function ProductionNavigation({ canAccessManagement, current }: { canAccessManagement: boolean; current: string }) {
  const links = [["/producao", "Produção"], ["/producao/minha-producao", "Minha produção"], ["/producao/meus-trabalhos", "Meus trabalhos"], ["/producao/retornos", "Meus retornos"],
    ...(canAccessManagement ? [["/gerencia", "Gerência"], ["/gerencia/qualidade", "Controle de qualidade"]] : []), ["/trocar-pin", "Alterar PIN"]];
  return <nav aria-label="Navegação principal" className="flex flex-wrap gap-2 py-5">
    {links.map(([href, label]) => <Link key={href} href={href} aria-current={current === href ? "page" : undefined}
      className={`rounded-xl px-4 py-3 text-sm font-semibold transition ${current === href ? "bg-(--brand) text-white" : "bg-(--surface) text-(--text-secondary) hover:bg-(--surface-hover)"}`}>{label}</Link>)}
  </nav>;
}
