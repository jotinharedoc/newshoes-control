import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { hash } from "bcryptjs";
import { prisma } from "./fake-prisma";
import { authenticateEmployee, changeEmployeePin, getAuthenticatedEmployee, logoutEmployee, requireAccess } from "../services/auth.service";
import { MANAGEMENT_PERMISSION } from "../utils/access";
import { hashSessionToken } from "../utils/auth";

const employee = {
  id: "test-employee", name: "Teste", active: true, mustChangePin: false,
  pinHash: "", failedPinAttempts: 0, pinLockedUntil: null,
  role: { active: true, permissions: [] as { permission: { code: string } }[] },
};

function sessionFor(overrides: Partial<typeof employee> = {}) {
  return mock.method(prisma.managementSession, "findFirst", async () => ({
    employee: { ...employee, ...overrides },
  }));
}

afterEach(() => mock.restoreAll());

test("sessão ausente não consulta o banco", async () => {
  const lookup = sessionFor();
  assert.equal(await getAuthenticatedEmployee(""), null);
  assert.equal(lookup.mock.callCount(), 0);
});

test("sessão expirada ou revogada é rejeitada e consulta filtra validade", async () => {
  const lookup = mock.method(prisma.managementSession, "findFirst", async () => null);
  await assert.rejects(requireAccess("token"), { code: "INVALID_SESSION", status: 401 });
  const query = lookup.mock.calls[0].arguments[0];
  assert.equal(query?.where?.tokenHash, hashSessionToken("token"));
  assert.equal(query?.where?.revokedAt, null);
  assert.ok(query?.where?.expiresAt);
});

test("funcionário inativo perde o acesso", async () => {
  sessionFor({ active: false });
  await assert.rejects(requireAccess("token"), { code: "INVALID_SESSION" });
});

test("cargo inativo perde o acesso", async () => {
  sessionFor({ role: { active: false, permissions: [] } });
  await assert.rejects(requireAccess("token"), { code: "INVALID_SESSION" });
});

test("PIN provisório impede acesso mesmo com permissão de gerência", async () => {
  sessionFor({ mustChangePin: true, role: { active: true, permissions: [{ permission: { code: MANAGEMENT_PERMISSION } }] } });
  await assert.rejects(requireAccess("token", MANAGEMENT_PERMISSION), { code: "PIN_CHANGE_REQUIRED", status: 403 });
});

test("funcionário pode entrar na produção mas não na gerência", async () => {
  sessionFor();
  assert.equal((await requireAccess("token")).destination, "/producao");
  await assert.rejects(requireAccess("token", MANAGEMENT_PERMISSION), { code: "FORBIDDEN", status: 403 });
});

test("gerência recebe somente dados públicos da sessão", async () => {
  sessionFor({ role: { active: true, permissions: [{ permission: { code: MANAGEMENT_PERMISSION } }] } });
  const result = await requireAccess("token", MANAGEMENT_PERMISSION);
  assert.equal(result.destination, "/gerencia");
  assert.equal("pinHash" in result, false);
  assert.equal("tokenHash" in result, false);
});

test("login correto gera sessão com hash e exige troca do PIN provisório", async () => {
  const pinHash = await hash("0000", 4);
  mock.method(prisma.employee, "findFirst", async () => ({ ...employee, pinHash, mustChangePin: true }));
  mock.method(prisma.employee, "update", async () => employee);
  const create = mock.method(prisma.managementSession, "create", async () => ({}));
  const result = await authenticateEmployee(employee.id, "0000");
  assert.equal(result.destination, "/trocar-pin");
  assert.equal(create.mock.calls[0].arguments[0]?.data.tokenHash, hashSessionToken(result.sessionToken));
});

test("PIN incorreto no limite bloqueia e não cria sessão", async () => {
  const pinHash = await hash("1234", 4);
  mock.method(prisma.employee, "findFirst", async () => ({ ...employee, pinHash, failedPinAttempts: 999 }));
  const update = mock.method(prisma.employee, "update", async () => employee);
  const create = mock.method(prisma.managementSession, "create", async () => ({}));
  await assert.rejects(authenticateEmployee(employee.id, "5678"), { code: "ACCOUNT_LOCKED", status: 429 });
  assert.ok(update.mock.calls[0].arguments[0]?.data.pinLockedUntil instanceof Date);
  assert.equal(create.mock.callCount(), 0);
});

test("troca rejeita PIN provisório e confirmação diferente", async () => {
  await assert.rejects(changeEmployeePin("token", "0000", "0000"), { code: "INVALID_INPUT" });
  await assert.rejects(changeEmployeePin("token", "1234", "4321"), { code: "INVALID_INPUT" });
});

test("troca válida salva hash e libera o acesso", async () => {
  sessionFor({ pinHash: await hash("0000", 4), mustChangePin: true });
  const update = mock.method(prisma.employee, "update", async () => employee);
  const result = await changeEmployeePin("token", "1234", "1234");
  assert.equal(result.employee.mustChangePin, false);
  assert.equal(result.destination, "/producao");
  const data = update.mock.calls[0].arguments[0]?.data;
  assert.ok(data);
  assert.equal(data.mustChangePin, false);
  assert.notEqual(data.pinHash, "1234");
});

test("sair revoga a sessão no banco", async () => {
  const revoke = mock.method(prisma.managementSession, "updateMany", async () => ({ count: 1 }));
  await logoutEmployee("token");
  assert.equal(revoke.mock.calls[0].arguments[0]?.where?.tokenHash, hashSessionToken("token"));
  assert.ok(revoke.mock.calls[0].arguments[0]?.data.revokedAt instanceof Date);
});
