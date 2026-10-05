"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Employee = { id: string; name: string; active: boolean; roleId: string; mustChangePin: boolean; role: { name: string }; processes: { processTypeId: string; processType: { name: string } }[] };
type Options = { employees: Employee[]; roles: { id: string; name: string }[]; processes: { id: string; name: string }[] };
type Rule = { id: string; processName: string; unit: string; amount: string };
type Audit = { id: string; createdAt: string; actor: { name: string }; action: string | null; targetType: string | null; targetId: string | null; reason: string; beforeData: unknown; afterData: unknown; employeeBreak: { kind: string } | null };
const panel = "space-y-4 rounded-2xl border border-(--border) bg-(--surface) p-5";
const button = "rounded-xl border border-(--border-strong) px-4 py-2 font-semibold disabled:opacity-50";
const unit: Record<string, string> = { PAIR: "Par", LEFT_FOOT: "Pé esquerdo", RIGHT_FOOT: "Pé direito" };
const actions: Record<string, string> = { PRODUCTION_REOPENED: "Trabalho retomado após conclusão", EMPLOYEE_CREATED: "Funcionário criado", EMPLOYEE_UPDATED: "Funcionário alterado", EMPLOYEE_REMOVED: "Funcionário removido", EMPLOYEE_RESTORED: "Funcionário restaurado", STOCK_REQUEST_CREATED: "Material solicitado", STOCK_REQUEST_UPDATED: "Solicitação de material atualizada", PIN_RESET: "PIN redefinido", COMMISSION_UPDATED: "Comissão alterada", OPERATIONAL_STARTED: "Pausa operacional iniciada", OPERATIONAL_FINISHED: "Pausa operacional encerrada" };
async function request<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(url, { method, cache: "no-store", ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message ?? "Não foi possível concluir a operação.");
  return result;
}
function message(error: unknown) { return error instanceof Error ? error.message : "Falha de comunicação. Atualize os dados."; }
function Feedback({ error, notice }: { error: string; notice: string }) {
  return <>{error && <p role="alert" className="rounded-xl bg-red-500/10 p-3">{error}</p>}{notice && <p role="status" className="rounded-xl bg-(--brand-soft) p-3">{notice}</p>}</>;
}

export function EmployeeAdministration() {
  const [data, setData] = useState<Options | null>(null);
  const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [name, setName] = useState(""); const [roleId, setRoleId] = useState(""); const [active, setActive] = useState(true);
  const [processIds, setProcessIds] = useState<string[]>([]); const [pin, setPin] = useState("");
  const [resetting, setResetting] = useState<Employee | null>(null); const [resetPin, setResetPin] = useState("");
  const saving = useRef(false);
  useEffect(() => { request<Options>("/api/management/employees").then(setData).catch(e => setError(message(e))); }, []);
  function select(employee: Employee | null) {
    setEditing(employee); setName(employee?.name ?? ""); setRoleId(employee?.roleId ?? ""); setActive(employee?.active ?? true);
    setProcessIds(employee?.processes.map(p => p.processTypeId) ?? []); setPin(""); setError("");
  }
  async function changeAvailability(employee: Employee) {
    if (saving.current) return;
    if (!window.confirm(employee.active
      ? `Remover ${employee.name}? O funcionário perderá acesso ao sistema, mas todo o histórico será preservado.`
      : `Restaurar o acesso de ${employee.name}?`)) return;
    saving.current = true; setBusy(true); setError(""); setNotice("");
    try {
      await request("/api/management/employees", "PATCH", { id: employee.id, action: employee.active ? "remove" : "restore" });
      setData(await request<Options>("/api/management/employees"));
      if (editing?.id === employee.id) select(null);
      setNotice(employee.active ? "Funcionário removido. Histórico preservado e sessões revogadas." : "Funcionário restaurado.");
    } catch (e) { setError(message(e)); }
    finally { saving.current = false; setBusy(false); }
  }
  async function save(reset = false) {
    if (saving.current) return;
    if (!window.confirm(reset ? `Redefinir o PIN de ${resetting?.name} e revogar suas sessões?` : `Salvar o cadastro de ${name}?`)) return;
    saving.current = true; setBusy(true); setError(""); setNotice("");
    try {
      await request("/api/management/employees", reset || editing ? "PATCH" : "POST", reset
        ? { action: "reset-pin", id: resetting!.id, pin: resetPin || "0000" }
        : { action: "update", id: editing?.id, name, roleId, active, processIds, ...(!editing ? { pin: pin || "0000" } : {}) });
      setPin(""); setResetPin(""); setResetting(null); select(null);
      setNotice(reset ? "PIN provisório redefinido. Sessões anteriores revogadas." : "Funcionário salvo.");
      setData(await request<Options>("/api/management/employees"));
    } catch (e) { setError(message(e)); }
    finally { saving.current = false; setBusy(false); }
  }
  return <div className="space-y-6">
    <Feedback error={error} notice={notice} />
    {!data ? <button className={button} onClick={() => request<Options>("/api/management/employees").then(setData).catch(e => setError(message(e)))}>Carregar funcionários</button> : <>
      <section className={panel}><h2 className="text-xl font-semibold">Funcionários cadastrados</h2>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Nome", "Cargo", "Situação", "Processos", "PIN", "Ações"].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>
          {data.employees.map(employee => <tr key={employee.id} className="border-t border-(--border)"><td className="p-2">{employee.name}</td><td className="p-2">{employee.role.name}</td><td className="p-2">{employee.active ? "Ativo" : "Inativo"}</td><td className="p-2">{employee.processes.map(p => p.processType.name).join(", ") || "Nenhum"}</td><td className="p-2">{employee.mustChangePin ? "Troca obrigatória" : "Definido"}</td><td className="flex flex-wrap gap-2 p-2"><button disabled={busy} className={button} onClick={() => select(employee)}>Editar {employee.name}</button><button disabled={busy} className={button} onClick={() => { setResetting(employee); setResetPin(""); }}>Resetar PIN de {employee.name}</button><button disabled={busy} className={button} onClick={() => void changeAvailability(employee)}>{employee.active ? "Remover funcionário" : "Restaurar funcionário"}</button><Link className={button} href={`/gerencia/funcionarios/${employee.id}`}>Resumo de {employee.name}</Link></td></tr>)}
        </tbody></table></div>
      </section>
      <form method="post" action="/api/management/employees" className={panel} onSubmit={event => { event.preventDefault(); void save(); }}>
        <h2 className="text-xl font-semibold">{editing ? `Editar ${editing.name}` : "Criar funcionário"}</h2>
        <fieldset disabled={busy} className="space-y-4">
          <label className="block">Nome<input name="name" value={name} onChange={e => setName(e.target.value)} required maxLength={100} className="auth-input" /></label>
          <label className="block">Cargo<select name="roleId" value={roleId} onChange={e => setRoleId(e.target.value)} required className="auth-input"><option value="">Selecione</option>{data.roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={active} disabled={!editing} onChange={e => setActive(e.target.checked)} />Funcionário ativo</label>
          <fieldset className="flex flex-wrap gap-4"><legend>Processos autorizados</legend>{data.processes.map(process => <label key={process.id} className="flex items-center gap-2 py-2"><input type="checkbox" checked={processIds.includes(process.id)} onChange={e => setProcessIds(ids => e.target.checked ? [...ids, process.id] : ids.filter(id => id !== process.id))} />{process.name}</label>)}</fieldset>
          {!editing && <label className="block">PIN provisório (vazio usa 0000)<input type="password" name="pin" inputMode="numeric" pattern="[0-9]{4}" autoComplete="new-password" value={pin} onChange={e => setPin(e.target.value)} className="auth-input" /></label>}
          <div className="flex flex-wrap gap-3"><button className="primary-button" type="submit">{busy ? "Salvando..." : "Salvar funcionário"}</button>{editing && <button className={button} type="button" onClick={() => select(null)}>Cancelar edição</button>}</div>
        </fieldset>
      </form>
      {resetting && <form method="post" action="/api/management/employees" className={panel} onSubmit={e => { e.preventDefault(); void save(true); }}><h2 className="text-xl font-semibold">Resetar PIN de {resetting.name}</h2><p>Exigirá troca no próximo acesso e encerrará todas as sessões deste funcionário.</p><label className="block">Novo PIN provisório (vazio usa 0000)<input name="pin" type="password" inputMode="numeric" pattern="[0-9]{4}" autoComplete="new-password" className="auth-input" value={resetPin} onChange={e => setResetPin(e.target.value)} disabled={busy} /></label><div className="flex gap-3"><button disabled={busy} type="submit" className="primary-button">Confirmar reset</button><button disabled={busy} type="button" className={button} onClick={() => { setResetting(null); setResetPin(""); }}>Cancelar reset</button></div></form>}
    </>}
  </div>;
}

export function CommissionAdministration() {
  const [rules, setRules] = useState<Rule[]>([]); const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false); const saving = useRef(false);
  useEffect(() => { request<Rule[]>("/api/management/commissions").then(setRules).catch(e => setError(message(e))); }, []);
  async function save(rule: Rule) {
    if (saving.current || !window.confirm(`Aplicar R$ ${rule.amount} a novas produções de ${rule.processName} / ${unit[rule.unit]}? Produções anteriores não serão alteradas.`)) return;
    saving.current = true; setBusy(true); setError(""); setNotice("");
    try { await request("/api/management/commissions", "PATCH", { id: rule.id, amount: rule.amount }); setRules(await request<Rule[]>("/api/management/commissions")); setNotice("Valor salvo somente para novas produções."); }
    catch (e) { setError(message(e)); } finally { saving.current = false; setBusy(false); }
  }
  return <div className="space-y-4"><p>Valores usados ao iniciar novas produções. Produções existentes conservam a comissão registrada no início. Retornos continuam sem comissão adicional.</p><Feedback error={error} notice={notice} />{rules.map(rule => <form key={rule.id} method="post" action="/api/management/commissions" className={panel} onSubmit={e => { e.preventDefault(); void save(rule); }}><h2 className="font-semibold">{rule.processName} · {unit[rule.unit]}</h2><label className="block">Valor em reais — {rule.processName} / {unit[rule.unit]}<input required inputMode="decimal" className="auth-input" value={rule.amount} disabled={busy} onChange={e => setRules(items => items.map(item => item.id === rule.id ? { ...item, amount: e.target.value } : item))} /></label><button type="submit" className="primary-button" disabled={busy}>Salvar {rule.processName} / {unit[rule.unit]}</button></form>)}</div>;
}

export function AuditAdministration() {
  const [rows, setRows] = useState<Audit[]>([]); const [employees, setEmployees] = useState<Employee[]>([]); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { request<Audit[]>("/api/management/audit").then(setRows).catch(e => setError(message(e))); request<Options>("/api/management/employees").then(data => setEmployees(data.employees)).catch(e => setError(message(e))); }, []);
  async function filter(form: HTMLFormElement) {
    setBusy(true); setError("");
    try { const params = new URLSearchParams(); new FormData(form).forEach((value, key) => { if (typeof value === "string" && value) params.set(key, value); }); setRows(await request<Audit[]>(`/api/management/audit?${params}`)); }
    catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  return <div className="space-y-4"><Feedback error={error} notice="" /><form method="get" className={panel} onSubmit={e => { e.preventDefault(); void filter(e.currentTarget); }}><div className="grid gap-3 sm:grid-cols-2"><label>De<input type="date" name="start" className="auth-input" /></label><label>Até<input type="date" name="end" className="auth-input" /></label><label>Responsável<select name="actorId" className="auth-input"><option value="">Todos</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label><label>Ação<select name="action" className="auth-input"><option value="">Todas</option>{Object.entries(actions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div><button className="primary-button" disabled={busy}>Filtrar auditoria</button></form>
    <p className="text-sm">Até 200 eventos mais recentes no período. Refine os filtros para consultar eventos anteriores. Horários de São Paulo.</p>
    {!rows.length && <p>Nenhum evento encontrado.</p>}
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Data/hora", "Responsável", "Ação", "Alvo", "Resumo / Antes e depois"].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-t border-(--border)"><td className="p-3">{new Date(row.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td><td className="p-3">{row.actor.name}</td><td className="p-3">{actions[row.action ?? ""] ?? "Correção administrativa"}</td><td className="max-w-48 break-words p-3">{row.targetType === "EMPLOYEE" ? "Funcionário" : row.targetType === "PROCESS_RULE" ? "Comissão" : row.employeeBreak?.kind === "OPERATIONAL" ? "Pausa Operacional" : row.targetType ?? "Registro"}<br />{row.targetId}</td><td className="p-3"><p>{row.reason}</p><details className="mt-2"><summary className="cursor-pointer">Antes / Depois</summary><p>Antes</p><pre className="max-w-lg whitespace-pre-wrap break-all">{JSON.stringify(row.beforeData, null, 2)}</pre><p>Depois</p><pre className="max-w-lg whitespace-pre-wrap break-all">{JSON.stringify(row.afterData, null, 2)}</pre></details></td></tr>)}</tbody></table></div>
  </div>;
}
