import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { test } from "node:test";
import "dotenv/config";

test("códigos integrais no PostgreSQL local", { skip: process.env.SHOE_CODE_POSTGRES_TESTS !== "1" }, async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Somente PostgreSQL local");
  const { prisma } = await import("../lib/prisma");
  const h = await import("../services/production.service");
  const f = await import("../services/finalization.service");
  const p = await import("../services/painting.service");
  const r = await import("../services/return.service");
  const suffix = String(randomInt(100_000_000_000, 999_999_999_999));
  const codes = [`00${suffix}`, `01${suffix}`, `33${suffix}`, suffix.padStart(64, "0")];
  let roleId: string | undefined;
  let employeeId: string | undefined;
  try {
    assert.equal(await prisma.shoe.count({ where: { code: { in: codes } } }), 0, "Não reutilizar códigos existentes nesta validação");
    const processes = await prisma.processType.findMany({ where: { active: true, name: { in: ["Higienização", "Finalização", "Pintura"] } } });
    assert.equal(processes.length, 3);
    const name = `QA código ${randomUUID()}`;
    const role = await prisma.role.create({ data: { name } });
    roleId = role.id;
    const employee = await prisma.employee.create({ data: {
      name, roleId, pinHash: "fixture-sem-login", mustChangePin: true,
      processes: { create: processes.map(process => ({ processTypeId: process.id })) },
    } });
    employeeId = employee.id;
    const first = (await h.startHygieneProduction(employeeId, codes[0])).current!;
    assert.equal(first.code, codes[0]);
    const next = (await h.finishAndStartNextHygieneProduction(employeeId, first.id, first.version, codes[1])).current!;
    assert.equal(next.code, codes[1]);
    assert.equal((await prisma.production.findUniqueOrThrow({ where: { id: first.id } })).status, "COMPLETED");
    const switched = (await h.startHygieneProduction(employeeId, codes[2])).current!;
    assert.equal(switched.code, codes[2]);
    assert.equal((await prisma.production.findUniqueOrThrow({ where: { id: next.id } })).status, "DEFERRED");
    for (const code of codes) {
      assert.equal((await f.startFinalizationProduction(employeeId, code, "PAIR")).current?.code, code);
      assert.equal((await p.startPaintingProduction(employeeId, code)).current?.code, code);
      const saved = await prisma.shoe.findUniqueOrThrow({ where: { code } });
      assert.equal(saved.code, code);
    }
    const candidates = await r.getQualityReturnCandidates(codes[0]);
    assert.equal(candidates[0].shoe.code, codes[0]);
    const pending = await r.requestQualityReturn(first.id, "Validação temporária de código");
    const returned = await r.changeReturnState(employeeId, pending.id, pending.version, "start");
    assert.ok(returned.some(item => item.code === codes[0]));
    const before = await prisma.production.findMany({ where: { employeeId } });
    const invalid = "0".repeat(65);
    const error = { code: "INVALID_INPUT", status: 400 };
    await assert.rejects(h.startHygieneProduction(employeeId, invalid), error);
    await assert.rejects(h.finishAndStartNextHygieneProduction(employeeId, first.id, first.version, invalid), error);
    await assert.rejects(f.startFinalizationProduction(employeeId, invalid, "PAIR"), error);
    await assert.rejects(p.startPaintingProduction(employeeId, invalid), error);
    await assert.rejects(r.getQualityReturnCandidates(invalid), error);
    assert.deepEqual(await prisma.production.findMany({ where: { employeeId } }), before);
    assert.equal(await prisma.shoe.count({ where: { code: invalid } }), 0);
  } finally {
    if (employeeId) {
      const owned = await prisma.production.findMany({ where: { employeeId }, select: { id: true, shoeId: true } });
      const ids = owned.map(item => item.id);
      await prisma.$transaction(async db => {
        await db.workSession.deleteMany({ where: { productionId: { in: ids } } });
        await db.commissionEntry.deleteMany({ where: { productionId: { in: ids } } });
        await db.production.deleteMany({ where: { employeeId, kind: "RETURN" } });
        await db.production.deleteMany({ where: { employeeId } });
        await db.shoe.deleteMany({ where: { id: { in: owned.map(item => item.shoeId) }, productions: { none: {} } } });
        await db.employeeProcess.deleteMany({ where: { employeeId } });
        await db.employee.delete({ where: { id: employeeId } });
      });
    }
    if (roleId) await prisma.role.delete({ where: { id: roleId } });
    await prisma.$disconnect();
  }
});
