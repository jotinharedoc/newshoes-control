import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { Prisma } from "../lib/generated/prisma/client";
import { hash } from "bcryptjs";
import "dotenv/config";

// Opt in explicitly. Never write to a remote database or existing employees.
test("autenticação concorrente no PostgreSQL local", { skip: process.env.AUTH_POSTGRES_TESTS !== "1" }, async t => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Exige PostgreSQL local");
  const { prisma } = await import("../lib/prisma");
  const { authenticateEmployee } = await import("../services/auth.service");
  const { authConfig } = await import("../utils/auth");
  const name = `QA concorrência PIN ${randomUUID()}`;
  const limit = authConfig.maxFailedAttempts;
  assert.equal(limit, 5, "Esta homologação exige o limite atual de cinco tentativas");
  let roleId: string | undefined;
  let employeeId: string | undefined;
  try {
    const role = await prisma.role.create({ data: { name } });
    roleId = role.id;
    const employee = await prisma.employee.create({ data: { name, roleId, pinHash: await hash("1234", 12) } });
    employeeId = employee.id;
    const id = employee.id;
    const state = () => prisma.employee.findUniqueOrThrow({ where: { id } });
    const sessions = () => prisma.managementSession.count({ where: { employeeId: id } });
    const reset = async (failedPinAttempts = 0, pinLockedUntil: Date | null = null) => {
      await prisma.managementSession.deleteMany({ where: { employeeId: id } });
      await prisma.employee.update({ where: { id }, data: { failedPinAttempts, pinLockedUntil } });
    };
    const wrong = () => authenticateEmployee(id, "9999");
    const right = () => authenticateEmployee(id, "1234");

    await t.test("A: cinco erros simultâneos persistem cinco falhas, bloqueio e zero sessões", async () => {
      const results = await Promise.allSettled(Array.from({ length: limit }, wrong));
      assert.ok(results.every(result => result.status === "rejected"));
      const codes = results.map(result => result.status === "rejected" ? result.reason.code : "success");
      assert.equal(codes.filter(code => code === "INVALID_CREDENTIALS").length, 4);
      assert.equal(codes.filter(code => code === "ACCOUNT_LOCKED").length, 1);
      const current = await state();
      assert.equal(current.failedPinAttempts, 5);
      assert.ok(current.pinLockedUntil && current.pinLockedUntil > new Date());
      assert.equal(await sessions(), 0);
    });

    await t.test("C: bloqueio rejeita inclusive PIN correto sem criar sessão", async () => {
      const before = await state();
      await assert.rejects(right(), { code: "ACCOUNT_LOCKED" });
      await assert.rejects(wrong(), { code: "ACCOUNT_LOCKED" });
      const after = await state();
      assert.equal(after.failedPinAttempts, before.failedPinAttempts);
      assert.deepEqual(after.pinLockedUntil, before.pinLockedUntil);
      assert.equal(await sessions(), 0);
    });

    await t.test("B: três erros simultâneos persistem três falhas sem bloqueio", async () => {
      await reset();
      const results = await Promise.allSettled(Array.from({ length: 3 }, wrong));
      assert.ok(results.every(result => result.status === "rejected" && result.reason.code === "INVALID_CREDENTIALS"));
      const current = await state();
      assert.equal(current.failedPinAttempts, 3);
      assert.equal(current.pinLockedUntil, null);
      assert.equal(await sessions(), 0);
    });

    await t.test("D: erros concorrentes após expiração normalizam o contador uma única vez", async () => {
      await reset(limit, new Date(Date.now() - 60_000));
      const results = await Promise.allSettled(Array.from({ length: 3 }, wrong));
      assert.ok(results.every(result => result.status === "rejected" && result.reason.code === "INVALID_CREDENTIALS"));
      const current = await state();
      assert.equal(current.failedPinAttempts, 3);
      assert.equal(current.pinLockedUntil, null);
      assert.equal(await sessions(), 0);
    });

    await t.test("E: login correto zera falhas e bloqueio expirado e cria sessão", async () => {
      await reset(limit, new Date(Date.now() - 60_000));
      const result = await right();
      assert.equal(result.employee.id, id);
      assert.equal(result.destination, "/producao");
      const current = await state();
      assert.equal(current.failedPinAttempts, 0);
      assert.equal(current.pinLockedUntil, null);
      assert.equal(await sessions(), 1);
    });

    for (const validFirst of [true, false]) await t.test(`F: correto × incorreto, ${validFirst ? "correto" : "incorreto"} obtém o bloqueio de linha primeiro`, async () => {
      await reset(limit - 1);
      // Hold the first real row lock until the second transaction has started.
      // This forces both orders without sleeps or assumptions about bcrypt timing.
      const locked = Promise.withResolvers<void>();
      const secondStarted = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const originalTransaction = prisma.$transaction;
      const transaction = originalTransaction.bind(prisma);
      let calls = 0;
      prisma.$transaction = ((operation: (db: Prisma.TransactionClient) => Promise<unknown>) => {
        const order = ++calls;
        if (order === 2) secondStarted.resolve();
        return transaction(async db => {
          const controlled = order === 1 ? new Proxy(db, {
            get(target, key) {
              if (key === "$queryRaw") return async (query: TemplateStringsArray, ...values: unknown[]) => {
                const result = await target.$queryRaw(query, ...values);
                locked.resolve();
                await release.promise;
                return result;
              };
              return Reflect.get(target, key);
            },
          }) : db;
          return operation(controlled);
        });
      }) as typeof prisma.$transaction;
      let results: PromiseSettledResult<Awaited<ReturnType<typeof right>>>[];
      try {
        const first = (validFirst ? right : wrong)();
        // Attach rejection handlers immediately, including if the database fails.
        const firstResult = Promise.allSettled([first]);
        await Promise.race([locked.promise, first.then(() => { throw new Error("Missing row lock"); })]);
        const secondResult = Promise.allSettled([(validFirst ? wrong : right)()]);
        await secondStarted.promise;
        release.resolve();
        results = [...await firstResult, ...await secondResult];
      } finally {
        release.resolve();
        prisma.$transaction = originalTransaction;
      }
      const [valid, invalid] = validFirst ? results : [results[1], results[0]];
      assert.equal(invalid.status, "rejected");
      const current = await state();
      if (validFirst) {
        assert.equal(valid.status, "fulfilled");
        // Valid committed first; the wrong attempt must then increment from zero.
        assert.equal(current.failedPinAttempts, 1);
        assert.equal(current.pinLockedUntil, null);
        assert.equal(await sessions(), 1);
        assert.equal(invalid.status === "rejected" && invalid.reason.code, "INVALID_CREDENTIALS");
      } else {
        // Wrong committed first; the stale valid decision must not create a session.
        assert.ok(valid.status === "rejected");
        assert.equal(valid.reason.code, "ACCOUNT_LOCKED");
        assert.equal(current.failedPinAttempts, limit);
        assert.ok(current.pinLockedUntil && current.pinLockedUntil > new Date());
        assert.equal(await sessions(), 0);
        assert.equal(invalid.status === "rejected" && invalid.reason.code, "ACCOUNT_LOCKED");
      }
    });
  } finally {
    try {
      if (employeeId) {
        await prisma.managementSession.deleteMany({ where: { employeeId } });
        await prisma.employee.delete({ where: { id: employeeId } });
      }
      if (roleId) await prisma.role.delete({ where: { id: roleId } });
    } finally {
      await prisma.$disconnect();
    }
  }
});
