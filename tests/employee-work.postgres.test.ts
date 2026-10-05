import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { test } from "node:test";
import "dotenv/config";

test("acompanhamento e reabertura concorrente no PostgreSQL local", { skip: process.env.AUTH_POSTGRES_TESTS !== "1" }, async t => {
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.DATABASE_URL ?? "").hostname), "Somente banco local");
  const { prisma } = await import("../lib/prisma");
  const h = await import("../services/production.service");
  const f = await import("../services/finalization.service");
  const p = await import("../services/painting.service");
  const { reopenEmployeeWork, getEmployeeDayWorks } = await import("../services/employee-work.service");
  const { getEmployeeMonthlySummary, currentBrazilMonth } = await import("../services/employee-summary.service");
  const { productionDay } = await import("../utils/production-day");
  const prefix = `QA retomada ${randomUUID()}`;
  const role = await prisma.role.create({ data: { name: prefix } });
  const employees: string[] = [];
  const shoes: string[] = [];
  try {
    const processes = await prisma.processType.findMany({ where: { name: { in: ["Higienização", "Finalização", "Pintura"] }, active: true } });
    assert.equal(processes.length, 3);
    for (const name of ["funcionário", "outro"]) {
      const employee = await prisma.employee.create({ data: { name: `${prefix} ${name}`, roleId: role.id, processes: { create: processes.map(process => ({ processTypeId: process.id })) } } });
      employees.push(employee.id);
    }
    const [owner, other] = employees;
    const cases = [
      { name: "Higienização PAIR", start: (code: string) => h.startHygieneProduction(owner, code), finish: h.changeHygieneProductionState },
      ...(["PAIR", "LEFT_FOOT", "RIGHT_FOOT"] as const).map(unit => ({ name: `Finalização ${unit}`, start: (code: string) => f.startFinalizationProduction(owner, code, unit), finish: f.changeFinalizationProductionState })),
      { name: "Pintura PAIR", start: (code: string) => p.startPaintingProduction(owner, code), finish: p.changePaintingProductionState },
    ];
    for (const process of cases) await t.test(`${process.name}: IDs, ledger, permissão e concorrência reais`, async () => {
      const code = `000${randomInt(1e10, 9e10)}`;
      const current = (await process.start(code)).current!;
      const before = await prisma.production.findUniqueOrThrow({ where: { id: current.id } }); shoes.push(before.shoeId);
      await process.finish(owner, current.id, current.version, "finish");
      const completed = await prisma.production.findUniqueOrThrow({ where: { id: current.id }, include: { commission: true, sessions: true } });
      await assert.rejects(reopenEmployeeWork(other, current.id, completed.version), { status: 404 });
      await prisma.employee.update({ where: { id: owner }, data: { active: false } });
      await assert.rejects(reopenEmployeeWork(owner, current.id, completed.version), { status: 403 });
      await prisma.employee.update({ where: { id: owner }, data: { active: true } });
      await prisma.role.update({ where: { id: role.id }, data: { active: false } });
      await assert.rejects(reopenEmployeeWork(owner, current.id, completed.version), { status: 403 });
      await prisma.role.update({ where: { id: role.id }, data: { active: true } });
      await prisma.employeeProcess.delete({ where: { employeeId_processTypeId: { employeeId: owner, processTypeId: before.processTypeId } } });
      await assert.rejects(reopenEmployeeWork(owner, current.id, completed.version), { status: 403 });
      await prisma.employeeProcess.create({ data: { employeeId: owner, processTypeId: before.processTypeId } });
      const results = await Promise.allSettled([reopenEmployeeWork(owner, current.id, completed.version), reopenEmployeeWork(owner, current.id, completed.version)]);
      assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
      const rejection = results.find(r => r.status === "rejected") as PromiseRejectedResult;
      assert.equal(rejection.reason.status, 409, String(rejection.reason));
      const reopened = await prisma.production.findUniqueOrThrow({ where: { id: current.id }, include: { commission: true, sessions: { orderBy: { startedAt: "asc" } }, shoe: true } });
      assert.equal(reopened.id, before.id); assert.equal(reopened.shoeId, before.shoeId); assert.equal(reopened.shoe.code, code);
      assert.equal(reopened.unit, before.unit); assert.equal(reopened.completedAt, null); assert.equal(reopened.version, completed.version + 1);
      assert.equal(reopened.sessions.length, 2); assert.equal(reopened.sessions[1].kind, "RESUME"); assert.equal(reopened.sessions.filter(s => s.endedAt === null).length, 1);
      assert.deepEqual(reopened.sessions[0], completed.sessions[0]); assert.deepEqual(reopened.commission, completed.commission);
      assert.equal(reopened.commissionAmountSnapshot.toString(), before.commissionAmountSnapshot.toString());
      const summaryDuring = await getEmployeeMonthlySummary(owner);
      assert.ok(summaryDuring.earnedCommissionCents > 0, "comissão não some durante a reabertura");
      const finishResults = await Promise.allSettled([process.finish(owner, current.id, reopened.version, "finish"), process.finish(owner, current.id, reopened.version, "finish")]);
      assert.equal(finishResults.filter(r => r.status === "fulfilled").length, 1);
      assert.equal((finishResults.find(r => r.status === "rejected") as PromiseRejectedResult).reason.status, 409);
      assert.deepEqual(await prisma.commissionEntry.findUnique({ where: { productionId: current.id } }), completed.commission);
      assert.equal(await prisma.production.count({ where: { shoeId: before.shoeId } }), 1);
      const ledger = await prisma.commissionEntry.aggregate({ where: { production: { employeeId: owner } }, _sum: { amount: true } });
      assert.equal((await getEmployeeMonthlySummary(owner)).earnedCommissionCents, Math.round(Number(ledger._sum.amount) * 100));
    });
    await t.test("sessões determinam atividade e mês anterior/isolamento são preservados", async () => {
      const { start } = productionDay();
      const code = `000${randomInt(1e10, 9e10)}`;
      const shoe = await prisma.shoe.create({ data: { code } }); shoes.push(shoe.id);
      const yesterday = new Date(start.getTime() - 60_000);
      const process = processes.find(item => item.name === "Higienização")!;
      const old = await prisma.production.create({ data: { employeeId: owner, processTypeId: process.id, shoeId: shoe.id, kind: "STANDARD", unit: "PAIR", status: "COMPLETED", commissionAmountSnapshot: "0.37", startedAt: new Date(yesterday.getTime() - 60_000), completedAt: yesterday,
        sessions: { create: { kind: "INITIAL", startedAt: new Date(yesterday.getTime() - 60_000), endedAt: yesterday, endReason: "MANUAL_COMPLETION" } } } });
      await assert.rejects(reopenEmployeeWork(owner, old.id, old.version), { status: 409 });
      assert.ok(!(await getEmployeeDayWorks(owner)).works.some(w => w.id === old.id));
      await prisma.workSession.create({ data: { productionId: old.id, kind: "CONTINUATION", startedAt: start, endedAt: new Date(), endReason: "MANUAL_COMPLETION" } });
      const list = await getEmployeeDayWorks(owner);
      assert.ok(list.works.some(w => w.id === old.id && w.code === code));
      assert.equal((await getEmployeeDayWorks(other)).works.length, 0);
      await reopenEmployeeWork(owner, old.id, old.version);
      assert.equal((await prisma.production.findUniqueOrThrow({ where: { id: old.id } })).status, "IN_PROGRESS");
      assert.equal((await getEmployeeMonthlySummary(other)).earnedCommissionCents, 0);
      const previous = currentBrazilMonth(new Date(start.getFullYear(), start.getMonth() - 1, 15));
      assert.equal((await getEmployeeMonthlySummary(owner, previous)).earnedCommissionCents, 0);
    });
  } finally {
    // Only fixtures created by this test, never existing demonstration or production records.
    const owned = { employeeId: { in: employees } };
    await prisma.managementCorrection.deleteMany({ where: { actorEmployeeId: { in: employees } } });
    await prisma.commissionEntry.deleteMany({ where: { production: owned } });
    await prisma.workSession.deleteMany({ where: { production: owned } });
    await prisma.production.deleteMany({ where: owned });
    await prisma.employeeProcess.deleteMany({ where: owned });
    await prisma.employee.deleteMany({ where: { id: { in: employees }, roleId: role.id } });
    await prisma.shoe.deleteMany({ where: { id: { in: shoes } } });
    await prisma.role.delete({ where: { id: role.id } });
    await prisma.$disconnect();
  }
});
