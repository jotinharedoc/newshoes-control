import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import "dotenv/config";
import type { Production } from "../lib/generated/prisma/client";
import type { HygieneProductionView } from "../types/production.types";

test("usos independentes, concorrência e anulação/restauração preservam o histórico", { skip: process.env.SHOE_CODE_POSTGRES_TESTS !== "1" }, async t => {
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.DATABASE_URL!).hostname));
  const { prisma } = await import("../lib/prisma");
  const h = await import("../services/production.service");
  const f = await import("../services/finalization.service");
  const p = await import("../services/painting.service");
  const r = await import("../services/return.service");
  const a = await import("../services/production-administration.service");
  const m = await import("../services/management.service");
  const summary = await import("../services/employee-summary.service");
  const prefix = `QA ocorrências ${randomUUID()}`;
  const roles: string[] = [], employees: string[] = [];
  const codes = ["123456", "999999", "000123", "123"];
  try {
    assert.equal(await prisma.shoe.count({ where: { code: { in: codes } } }), 0, "Não alterar códigos preexistentes");
    const permission = await prisma.permission.findUniqueOrThrow({ where: { code: "management.access" } });
    const workerRole = await prisma.role.create({ data: { name: prefix } }); roles.push(workerRole.id);
    const managerRole = await prisma.role.create({ data: { name: `${prefix} gerente`, permissions: { create: { permissionId: permission.id } } } }); roles.push(managerRole.id);
    const processes = await prisma.processType.findMany({ where: { name: { in: ["Higienização", "Finalização", "Pintura"] } } });
    const createWorker = async () => {
      const employee = await prisma.employee.create({ data: { name: prefix, roleId: workerRole.id, mustChangePin: false, processes: { create: processes.map(process => ({ processTypeId: process.id })) } } });
      employees.push(employee.id); return employee.id;
    };
    const worker = await createWorker(), other = await createWorker();
    const manager = await prisma.employee.create({ data: { name: `${prefix} gerente`, roleId: managerRole.id, mustChangePin: false } }); employees.push(manager.id);
    for (const code of codes.slice(0, 2)) await t.test(`${code}: três ciclos completos sem anular nem excluir`, async () => {
      let head: string | null = null;
      for (let cycle = 1; cycle <= 3; cycle++) {
        const hygiene: HygieneProductionView = (await h.startHygieneProduction(worker, code, { newOccurrence: true, expectedLatestId: head })).current!;
        const original: Production = await prisma.production.findUniqueOrThrow({ where: { id: hygiene.id } });
        assert.ok(original.occurrenceId); head = original.occurrenceId;
        await h.changeHygieneProductionState(worker, hygiene.id, hygiene.version, "finish");
        const choice = { occurrenceId: original.occurrenceId };
        const left = (await f.startFinalizationProduction(worker, code, "LEFT_FOOT", choice)).current!;
        await f.changeFinalizationProductionState(worker, left.id, left.version, "finish");
        const right = (await f.startFinalizationProduction(worker, code, "RIGHT_FOOT", choice)).current!;
        await f.changeFinalizationProductionState(worker, right.id, right.version, "finish");
        await assert.rejects(f.startFinalizationProduction(worker, code, "PAIR", choice), { status: 409 });
        const painting = (await p.startPaintingProduction(worker, code, choice)).current!;
        await p.changePaintingProductionState(worker, painting.id, painting.version, "finish");
        await assert.rejects(h.startHygieneProduction(worker, code, choice), { status: 409 });
        await assert.rejects(p.startPaintingProduction(worker, code, choice), { status: 409 });
        const productions = await prisma.production.findMany({ where: { shoe: { code }, kind: "STANDARD" } });
        assert.equal(productions.length, cycle * 4); assert.ok(productions.every(row => row.status === "COMPLETED"));
        assert.equal(await prisma.commissionEntry.count({ where: { production: { shoe: { code } } } }), cycle * 4);
        assert.equal(await prisma.shoeOccurrence.count({ where: { shoe: { code } } }), cycle);
      }
    });
    await t.test("retorno conserva ocorrência e não gera comissão; anular/restaurar mantém IDs, ledger e sessões", async () => {
      const original = await prisma.production.findFirstOrThrow({ where: { shoe: { code: "123456" }, processType: { name: "Higienização" }, occurrence: { sequence: 1 } } });
      const returned = await r.requestQualityReturn(original.id, "QA qualidade");
      const view = (await r.changeReturnState(worker, returned.id, returned.version, "start")).find(row => row.id === returned.id)!;
      await r.changeReturnState(worker, view.id, view.version, "finish");
      assert.equal((await prisma.production.findUniqueOrThrow({ where: { id: returned.id } })).occurrenceId, original.occurrenceId);
      assert.equal(await prisma.commissionEntry.count({ where: { productionId: returned.id } }), 0);
      const before = await prisma.production.findUniqueOrThrow({ where: { id: original.id }, include: { sessions: true, commission: true } });
      await assert.rejects(a.correctProduction(worker, before.id, before.version, "cancel", "QA"), { status: 403 });
      await assert.rejects(a.correctProduction(manager.id, before.id, before.version, "cancel", ""), { status: 400 });
      const period = summary.summaryMonthPeriod(summary.currentBrazilMonth());
      const filters = { ...period, employeeId: worker };
      const dashboardBefore = await m.getManagementDashboard(filters);
      const monthlyBefore = await summary.getEmployeeMonthlySummary(worker);
      const cancelled = await a.correctProduction(manager.id, before.id, before.version, "cancel", "QA anulação");
      const dashboardCancelled = await m.getManagementDashboard(filters);
      assert.equal(dashboardCancelled.pagination.totalRecords, dashboardBefore.pagination.totalRecords - 1);
      assert.ok(!dashboardCancelled.rows.some(row => row.id === before.id));
      const exported = await m.getManagementExport(filters);
      assert.ok(!exported.employeeExportRows.some(row => row.productionId === before.id));
      const monthlyCancelled = await summary.getEmployeeMonthlySummary(worker);
      assert.equal(monthlyCancelled.hygienePairs, monthlyBefore.hygienePairs - 1);
      assert.equal(monthlyCancelled.earnedCommissionCents, monthlyBefore.earnedCommissionCents - Math.round(Number(before.commission!.amount) * 100));
      const saved = await prisma.production.findUniqueOrThrow({ where: { id: before.id }, include: { sessions: true, commission: true } });
      assert.deepEqual(saved.sessions, before.sessions); assert.deepEqual(saved.commission, before.commission);
      await assert.rejects(a.correctProduction(manager.id, before.id, before.version, "restore", "QA"), { status: 409 });
      const restored = await a.correctProduction(manager.id, before.id, cancelled.version, "restore", "QA restauração");
      assert.equal(restored.status, "COMPLETED");
      const after = await prisma.production.findUniqueOrThrow({ where: { id: before.id }, include: { sessions: true, commission: true } });
      assert.deepEqual((await m.getManagementDashboard(filters)).totals, dashboardBefore.totals);
      assert.deepEqual(await summary.getEmployeeMonthlySummary(worker), monthlyBefore);
      assert.equal(after.occurrenceId, before.occurrenceId); assert.deepEqual(after.sessions, before.sessions); assert.deepEqual(after.commission, before.commission);
      const audit = await prisma.managementCorrection.findMany({ where: { productionId: before.id } });
      assert.deepEqual(audit.map(row => row.action).sort(), ["PRODUCTION_CANCELLED", "PRODUCTION_RESTORED"]);
      assert.ok(!/pinHash|tokenHash|DATABASE_URL/.test(JSON.stringify(audit)));
    });
    await t.test("zeros distintos e dois celulares não criam dois novos usos", async () => {
      const result = await Promise.allSettled([h.startHygieneProduction(worker, "000123", { newOccurrence: true, expectedLatestId: null }), h.startHygieneProduction(other, "000123", { newOccurrence: true, expectedLatestId: null })]);
      assert.equal(result.filter(row => row.status === "fulfilled").length, 1);
      assert.equal(await prisma.shoeOccurrence.count({ where: { shoe: { code: "000123" } } }), 1);
      const pending = await prisma.production.findFirstOrThrow({ where: { shoe: { code: "000123" } } });
      await h.changeHygieneProductionState(pending.employeeId, pending.id, pending.version, "finish");
      const distinct = (await h.startHygieneProduction(worker, "123")).current!;
      await h.changeHygieneProductionState(worker, distinct.id, distinct.version, "finish");
      assert.equal(await prisma.shoe.count({ where: { code: { in: ["000123", "123"] } } }), 2);
    });
    await t.test("PAIR reutilizável, restauração com conflito e anulação de trabalho aberto", async () => {
      let occurrence = await prisma.shoeOccurrence.findFirstOrThrow({ where: { shoe: { code: "123" } }, orderBy: { sequence: "desc" } });
      for (let index = 0; index < 3; index++) {
        const choice = index === 0 ? { occurrenceId: occurrence.id } : { newOccurrence: true, expectedLatestId: occurrence.id };
        const view = (await f.startFinalizationProduction(worker, "123", "PAIR", choice)).current!;
        const saved = await prisma.production.findUniqueOrThrow({ where: { id: view.id } });
        occurrence = await prisma.shoeOccurrence.findUniqueOrThrow({ where: { id: saved.occurrenceId! } });
        await f.changeFinalizationProductionState(worker, view.id, view.version, "finish");
        await assert.rejects(f.startFinalizationProduction(worker, "123", "LEFT_FOOT", { occurrenceId: occurrence.id }), { status: 409 });
        await assert.rejects(f.startFinalizationProduction(worker, "123", "RIGHT_FOOT", { occurrenceId: occurrence.id }), { status: 409 });
      }
      const first = await prisma.production.findFirstOrThrow({ where: { shoe: { code: "123" }, processType: { name: "Higienização" } } });
      const cancelled = await a.correctProduction(manager.id, first.id, first.version, "cancel", "QA conflito");
      const replacement = (await h.startHygieneProduction(worker, "123", { occurrenceId: first.occurrenceId! })).current!;
      await assert.rejects(a.correctProduction(manager.id, first.id, cancelled.version, "restore", "QA conflito"), { status: 409 });
      const pending = await a.correctProduction(manager.id, replacement.id, replacement.version, "cancel", "QA aberto");
      const row = await prisma.production.findUniqueOrThrow({ where: { id: replacement.id }, include: { sessions: true } });
      assert.equal(row.cancelledFromStatus, "IN_PROGRESS");
      assert.ok(row.sessions.every(session => session.endedAt !== null));
      assert.equal(await prisma.commissionEntry.count({ where: { productionId: replacement.id } }), 0);
      await assert.rejects(a.correctProduction(manager.id, row.id, pending.version, "restore", "QA"), { status: 409 });
    });
  } finally {
    const owned = { employeeId: { in: employees } };
    const shoes = await prisma.shoe.findMany({ where: { productions: { some: owned } }, select: { id: true } });
    await prisma.managementCorrection.deleteMany({ where: { actorEmployeeId: { in: employees } } });
    await prisma.commissionEntry.deleteMany({ where: { production: owned } });
    await prisma.workSession.deleteMany({ where: { production: owned } });
    await prisma.production.deleteMany({ where: { ...owned, kind: "RETURN" } });
    await prisma.production.deleteMany({ where: owned });
    await prisma.shoeOccurrence.deleteMany({ where: { shoeId: { in: shoes.map(row => row.id) }, productions: { none: {} } } });
    await prisma.shoe.deleteMany({ where: { id: { in: shoes.map(row => row.id) }, productions: { none: {} } } });
    await prisma.employeeProcess.deleteMany({ where: owned });
    await prisma.employee.deleteMany({ where: { id: { in: employees }, roleId: { in: roles } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: roles } } });
    await prisma.role.deleteMany({ where: { id: { in: roles } } });
    await prisma.$disconnect();
  }
});
