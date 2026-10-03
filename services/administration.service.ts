import { hash } from "bcryptjs";
import { setEmployeeActive } from "@/repositories/administration.repository";
import { Prisma } from "@/lib/generated/prisma/client";
import { createAuditEvent, publicEmployeeSelect, runAdministrationTransaction, lockAdministration, findAdministrationActor, findAssignableRole, countAssignableProcesses, findEmployeeForAdministration, countActiveManagers, saveEmployeeRecord, revokeEmployeeSessions, resetEmployeeCredentials, findCommissionRule, saveCommissionRule } from "@/repositories/administration.repository";
import { AuthError } from "@/types/auth.types";
import { MANAGEMENT_PERMISSION } from "@/utils/access";

function invalid(message: string): never { throw new AuthError("INVALID_INPUT", message, 400); }

async function authorize(db: Prisma.TransactionClient, actorId: string) {
  // Serialize administration so concurrent changes cannot remove the last manager.
  await lockAdministration(db);
  const actor = await findAdministrationActor(db, actorId);
  if (!actor) throw new AuthError("FORBIDDEN", "Acesso exclusivo da gerência.", 403);
}

function pinValue(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}$/.test(value)) invalid("Informe um PIN provisório de quatro números.");
  return value;
}

export function commissionValue(value: unknown) {
  if (typeof value !== "string" || !/^\d{1,4}([.,]\d{1,2})?$/.test(value.trim())) invalid("Informe um valor de 0,00 a 9.999,99, com até duas casas decimais.");
  return new Prisma.Decimal(value.trim().replace(",", "."));
}

function employeeInput(input: Record<string, unknown>) {
  if (typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 100) invalid("Informe um nome com até 100 caracteres.");
  if (typeof input.roleId !== "string" || !input.roleId) invalid("Selecione um cargo.");
  if (typeof input.active !== "boolean") invalid("Informe se o funcionário está ativo.");
  if (!Array.isArray(input.processIds) || input.processIds.some(id => typeof id !== "string" || !id)) invalid("Selecione processos válidos.");
  return { name: input.name.trim(), roleId: input.roleId, active: input.active, processIds: [...new Set(input.processIds as string[])] };
}

type EmployeeView = Prisma.EmployeeGetPayload<{ select: typeof publicEmployeeSelect }>;
function snapshot(employee: EmployeeView) {
  return { id: employee.id, name: employee.name, active: employee.active, roleId: employee.roleId,
    roleName: employee.role.name, mustChangePin: employee.mustChangePin,
    processIds: employee.processes.map(p => p.processTypeId).sort() };
}

async function existingEmployee(db: Prisma.TransactionClient, id: string) {
  const employee = await findEmployeeForAdministration(db, id);
  if (!employee) throw new AuthError("INVALID_INPUT", "Funcionário não encontrado.", 404);
  return employee;
}

export async function saveAdministrationEmployee(actorId: string, input: Record<string, unknown>, employeeId?: string) {
  const data = employeeInput(input);
  if (!employeeId && !data.active) invalid("Novo funcionário deve começar ativo.");
  const provisionalHash = employeeId ? undefined : await hash(pinValue(input.pin ?? "0000"), 12);
  return runAdministrationTransaction(async db => {
    await authorize(db, actorId);
    const role = await findAssignableRole(db, data.roleId);
    if (!role) invalid("Cargo inexistente ou inativo.");
    if (await countAssignableProcesses(db, data.processIds) !== data.processIds.length) invalid("Processo inexistente ou inativo.");
    const before = employeeId ? await existingEmployee(db, employeeId) : null;
    const becomesManager = data.active && role.permissions.some(p => p.permission.code === MANAGEMENT_PERMISSION);
    if (employeeId === actorId && !becomesManager) invalid("Você não pode desativar ou remover seu próprio acesso à gerência.");
    if (before && !becomesManager) {
      const wasManager = await countActiveManagers(db, before.id);
      if (wasManager && await countActiveManagers(db, before.id, true) === 0) invalid("Mantenha pelo menos um gerente ativo.");
    }
    const after = await saveEmployeeRecord(db, data, employeeId, provisionalHash);
    if (before && (before.roleId !== after.roleId || !after.active)) {
      await revokeEmployeeSessions(db, after.id);
    }
    await createAuditEvent(db, { actorEmployeeId: actorId, action: before ? "EMPLOYEE_UPDATED" : "EMPLOYEE_CREATED", targetType: "EMPLOYEE", targetId: after.id,
      reason: before ? "Cadastro de funcionário alterado" : "Funcionário criado", beforeData: before ? snapshot(before) : {}, afterData: snapshot(after) });
    return after;
  });
}

export async function resetAdministrationPin(actorId: string, employeeId: string, pin: unknown = "0000") {
  const pinHash = await hash(pinValue(pin), 12);
  return runAdministrationTransaction(async db => {
    await authorize(db, actorId);
    const before = await existingEmployee(db, employeeId);
    await resetEmployeeCredentials(db, employeeId, pinHash);
    await revokeEmployeeSessions(db, employeeId);
    // Deliberate allowlist: never audit credentials, even their hashes.
    await createAuditEvent(db, { actorEmployeeId: actorId, action: "PIN_RESET", targetType: "EMPLOYEE", targetId: employeeId,
      reason: "PIN provisório redefinido e sessões revogadas", beforeData: { mustChangePin: before.mustChangePin }, afterData: { mustChangePin: true, sessionsRevoked: true } });
    return { success: true };
  });
}

export async function changeEmployeeAvailability(actorId: string, employeeId: string, active: boolean) {
  return runAdministrationTransaction(async db => {
    await authorize(db, actorId);
    const before = await existingEmployee(db, employeeId);
    if (!active && actorId === employeeId) invalid("Você não pode remover seu próprio acesso à gerência.");
    if (!active && await countActiveManagers(db, employeeId) && await countActiveManagers(db, employeeId, true) === 0) {
      invalid("Mantenha pelo menos um gerente ativo.");
    }
    if (active && !before.role.active) invalid("Ative o cargo antes de restaurar o funcionário.");
    if (before.active === active) return before;
    const after = await setEmployeeActive(db, employeeId, active);
    if (!active) await revokeEmployeeSessions(db, employeeId);
    await createAuditEvent(db, {
      actorEmployeeId: actorId, action: active ? "EMPLOYEE_RESTORED" : "EMPLOYEE_REMOVED",
      targetType: "EMPLOYEE", targetId: employeeId,
      reason: active ? "Funcionário restaurado com histórico preservado" : "Funcionário removido do acesso; histórico preservado e sessões revogadas",
      beforeData: snapshot(before), afterData: snapshot(after),
    });
    return after;
  });
}

export async function updateAdministrationCommission(actorId: string, ruleId: string, amount: unknown) {
  const value = commissionValue(amount);
  return runAdministrationTransaction(async db => {
    await authorize(db, actorId);
    const before = await findCommissionRule(db, ruleId);
    if (!before) throw new AuthError("INVALID_INPUT", "Regra de comissão não encontrada.", 404);
    await saveCommissionRule(db, ruleId, value);
    const context = { process: before.processType.name, unit: before.unit };
    await createAuditEvent(db, { actorEmployeeId: actorId, action: "COMMISSION_UPDATED", targetType: "PROCESS_RULE", targetId: ruleId,
      reason: "Valor de comissão alterado somente para novas produções", beforeData: { ...context, amount: before.commissionAmount.toFixed(2) }, afterData: { ...context, amount: value.toFixed(2) } });
    return { success: true, amount: value.toFixed(2) };
  });
}
