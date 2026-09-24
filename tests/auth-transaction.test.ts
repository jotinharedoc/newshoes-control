import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { hash } from "bcryptjs";
import { prisma } from "./fake-prisma";
import { Prisma } from "../lib/generated/prisma/client";
import { runAuthenticationTransaction } from "../repositories/employee.repository";
import { authenticateEmployee } from "../services/auth.service";

afterEach(() => mock.restoreAll());
beforeEach(() => { mock.method(prisma, "$queryRaw", async () => []); });
const conflict = () => new Prisma.PrismaClientKnownRequestError("Serialization conflict", { code: "P2034", clientVersion: "test" });

test("bloqueio de linha é parametrizado e ocorre antes da decisão", async () => {
  const id = "employee' OR '1'='1";
  let locked = false;
  const query = mock.method(prisma, "$queryRaw", async () => { locked = true; return []; });
  await runAuthenticationTransaction(id, async () => { assert.equal(locked, true); });
  const [parts, value] = query.mock.calls[0].arguments;
  assert.ok(parts);
  assert.equal(value, id);
  assert.equal(parts.join("?").includes(id), false);
  assert.match(parts.join("?"), /WHERE "id" = \? FOR UPDATE/);
});

test("autenticação repete a transação inteira após conflito de serialização", async () => {
  let decisions = 0;
  const transaction = mock.method(prisma, "$transaction", async (operation: (database: Prisma.TransactionClient) => Promise<unknown>) => {
    const result = await operation(prisma as unknown as Prisma.TransactionClient);
    if (decisions === 1) throw conflict();
    return result;
  });
  assert.equal(await runAuthenticationTransaction("test", async () => ++decisions), 2);
  assert.equal(transaction.mock.callCount(), 2);
});

test("erros fora de concorrência não são repetidos", async () => {
  const failure = new Error("Session creation failed");
  const transaction = mock.method(prisma, "$transaction", async () => { throw failure; });
  await assert.rejects(runAuthenticationTransaction("test", async () => null), error => error === failure);
  assert.equal(transaction.mock.callCount(), 1);
});

test("repetição de conflitos é limitada e não retorna sucesso", async () => {
  const transaction = mock.method(prisma, "$transaction", async () => { throw conflict(); });
  await assert.rejects(runAuthenticationTransaction("test", async () => null), { code: "P2034" });
  assert.equal(transaction.mock.callCount(), 10);
});

test("login válido com snapshot antigo reavalia bloqueio após conflito", async () => {
  const pinHash = await hash("1234", 4);
  let locked = false;
  mock.method(prisma.employee, "findFirst", async () => ({
    id: "test", name: "Teste", active: true, pinHash, mustChangePin: false,
    failedPinAttempts: locked ? 5 : 4, pinLockedUntil: locked ? new Date(Date.now() + 60_000) : null,
    role: { active: true, permissions: [] },
  }));
  mock.method(prisma.employee, "update", async () => ({}));
  let committedSessions = 0;
  const session = mock.method(prisma.managementSession, "create", async () => ({}));
  mock.method(prisma, "$transaction", async (operation: (database: Prisma.TransactionClient) => Promise<unknown>) => {
    const result = await operation(prisma as unknown as Prisma.TransactionClient);
    if (!locked) { locked = true; throw conflict(); }
    committedSessions++;
    return result;
  });
  await assert.rejects(authenticateEmployee("test", "1234"), { code: "ACCOUNT_LOCKED" });
  assert.equal(session.mock.callCount(), 1); // Attempted only in the rolled-back transaction.
  assert.equal(committedSessions, 0);
});
