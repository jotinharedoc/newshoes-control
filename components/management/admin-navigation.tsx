import Link from "next/link";
export function AdminNavigation() {
  return <nav aria-label="Administração" className="flex flex-wrap gap-4 py-4 text-sm font-semibold text-(--brand)">
    <Link href="/gerencia">Relatórios</Link><Link href="/gerencia/funcionarios">Funcionários</Link>
    <Link href="/gerencia/registros">Registros</Link><Link href="/gerencia/comissoes">Comissões</Link><Link href="/gerencia/auditoria">Auditoria</Link><Link href="/gerencia/qualidade">Qualidade</Link>
  </nav>;
}
