import assert from "node:assert/strict";
import { randomUUID, randomInt } from "node:crypto";
import { test } from "node:test";
import { compare, hash } from "bcryptjs";
import "dotenv/config";

test("administração e pausa operacional no PostgreSQL local", { skip: process.env.ADMIN_POSTGRES_TESTS !== "1" }, async t => {
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.DATABASE_URL ?? "").hostname), "Somente banco local");
  const { prisma } = await import("../lib/prisma");
  const admin = await import("../services/administration.service");
  const h = await import("../services/production.service");
  const b = await import("../services/employee-break.service");
  const r = await import("../services/return.service");
  const auth = await import("../services/auth.service");
  const prefix = `QA administração ${randomUUID()}`;
  const roles: string[] = [], employees: string[] = [];
  let restoreRule: { id: string; amount: string } | undefined;
  try {
    const role = await prisma.role.create({ data: { name: prefix } }); roles.push(role.id);
    const permission = await prisma.permission.findUniqueOrThrow({ where: { code: "management.access" } });
    const managerRole = await prisma.role.create({ data: { name: `${prefix} gerente`, permissions: { create: { permissionId: permission.id } } } }); roles.push(managerRole.id);
    const manager = await prisma.employee.create({ data: { name: `${prefix} gestor`, roleId: managerRole.id, pinHash: await hash("1234", 12), mustChangePin: false } }); employees.push(manager.id);
    const process = await prisma.processType.findUniqueOrThrow({ where: { name: "Higienização" }, include: { rules: { where: { unit: "PAIR" } } } });
    let workerId = "";
    const input = { name: `${prefix} funcionário`, roleId: role.id, active: true, processIds: [process.id, process.id], pin: "1234" };
    await t.test("criação: hash, troca obrigatória, processos sem duplicação e ator na auditoria", async () => {
      const created = await admin.saveAdministrationEmployee(manager.id, input); workerId = created.id; employees.push(workerId);
      const saved = await prisma.employee.findUniqueOrThrow({ where: { id: workerId } });
      assert.equal(saved.mustChangePin, true); assert.ok(await compare("1234", saved.pinHash!));
      assert.equal(await prisma.employeeProcess.count({ where: { employeeId: workerId } }), 1);
      const audit = await prisma.managementCorrection.findFirstOrThrow({ where: { targetId: workerId } });
      assert.equal(audit.actorEmployeeId, manager.id); assert.equal(audit.action, "EMPLOYEE_CREATED"); assert.ok(audit.createdAt instanceof Date);
      assert.ok(!("pinHash" in created));
    });
    await t.test("edição, ativação/desativação, cargo/processos e IDs inválidos", async () => {
      await admin.saveAdministrationEmployee(manager.id, { ...input, name: `${prefix} editado`, active: false, processIds: [] }, workerId);
      await assert.rejects(auth.authenticateEmployee(workerId, "1234"), { code: "INVALID_CREDENTIALS" });
      assert.equal(await prisma.employeeProcess.count({ where: { employeeId: workerId } }), 0);
      await admin.saveAdministrationEmployee(manager.id, { ...input, roleId: managerRole.id }, workerId);
      assert.equal((await prisma.employee.findUniqueOrThrow({ where: { id: workerId } })).roleId, managerRole.id);
      await admin.saveAdministrationEmployee(manager.id, input, workerId);
      for (const invalid of [{ ...input, roleId: "missing" }, { ...input, processIds: ["missing"] }]) await assert.rejects(admin.saveAdministrationEmployee(manager.id, invalid, workerId), { status: 400 });
      await assert.rejects(admin.saveAdministrationEmployee(manager.id, input, "missing"), { status: 404 });
      await assert.rejects(admin.saveAdministrationEmployee(manager.id, { ...input, active: false }, manager.id), { status: 400 });
      await assert.rejects(admin.saveAdministrationEmployee(workerId, input, workerId), { status: 403 });
    });
    await t.test("reset PIN limpa bloqueio, exige troca, revoga sessão e não audita credenciais", async () => {
      await prisma.employee.update({ where: { id: workerId }, data: { mustChangePin: false } });
      await auth.authenticateEmployee(workerId, "1234");
      await prisma.employee.update({ where: { id: workerId }, data: { failedPinAttempts: 4, pinLockedUntil: new Date(Date.now() + 60000) } });
      await admin.resetAdministrationPin(manager.id, workerId, "5678");
      const saved = await prisma.employee.findUniqueOrThrow({ where: { id: workerId } });
      assert.equal(saved.failedPinAttempts, 0); assert.equal(saved.pinLockedUntil, null); assert.equal(saved.mustChangePin, true);
      assert.equal(await prisma.managementSession.count({ where: { employeeId: workerId, revokedAt: null } }), 0);
      assert.equal((await auth.authenticateEmployee(workerId, "5678")).destination, "/trocar-pin");
      await assert.rejects(auth.authenticateEmployee(workerId, "1234"), { status: 401 });
      const audits = await prisma.managementCorrection.findMany({ where: { actorEmployeeId: manager.id } });
      const text = JSON.stringify(audits);
      assert.ok(!text.includes("5678") && !text.includes('"pinHash"') && !text.includes('"tokenHash"') && !text.includes("$2b$"));
      assert.ok(audits.some(event => event.action === "PIN_RESET"));
      await prisma.employee.update({ where: { id: workerId }, data: { mustChangePin: false } });
    });
    await t.test("comissão nova não altera snapshot nem lançamento anterior; retorno continua zero", async () => {
      const rule = process.rules[0]; restoreRule = { id: rule.id, amount: rule.commissionAmount.toFixed(2) };
      const first = (await h.startHygieneProduction(workerId, `0${randomInt(1e10, 9e10)}`)).current!;
      await admin.updateAdministrationCommission(manager.id, rule.id, "0.60");
      const second = (await h.startHygieneProduction(workerId, `0${randomInt(1e10, 9e10)}`)).current!;
      assert.equal((await prisma.production.findUniqueOrThrow({ where: { id: first.id } })).commissionAmountSnapshot.toFixed(2), restoreRule.amount);
      assert.equal((await prisma.production.findUniqueOrThrow({ where: { id: second.id } })).commissionAmountSnapshot.toFixed(2), "0.60");
      const current = await prisma.production.findUniqueOrThrow({ where: { id: first.id } });
      await h.changeHygieneProductionState(workerId, first.id, current.version, "continue");
      const resumed = await prisma.production.findUniqueOrThrow({ where: { id: first.id } });
      await h.changeHygieneProductionState(workerId, first.id, resumed.version, "finish");
      const original = await prisma.commissionEntry.findUniqueOrThrow({ where: { productionId: first.id } });
      const returned = await r.requestQualityReturn(first.id, "Validação temporária");
      await r.changeReturnState(workerId, returned.id, returned.version, "start");
      const state = await prisma.production.findUniqueOrThrow({ where: { id: returned.id } });
      await r.changeReturnState(workerId, returned.id, state.version, "finish");
      assert.equal(await prisma.commissionEntry.count({ where: { productionId: returned.id } }), 0);
      assert.deepEqual(await prisma.commissionEntry.findUniqueOrThrow({ where: { productionId: first.id } }), original);
      await assert.rejects(admin.updateAdministrationCommission(workerId, rule.id, "0.70"), { status: 403 });
    });
    await t.test("pausa persiste, fecha sessão, retoma com RESUME e registra auditoria sem comissão", async () => {
      const production = (await h.startHygieneProduction(workerId, `0${randomInt(1e10, 9e10)}`)).current!;
      const count = await prisma.commissionEntry.count({ where: { production: { employeeId: workerId } } });
      const opened = (await b.startEmployeeBreak(workerId, "OPERATIONAL")).current!;
      assert.equal((await b.getEmployeeBreakOverview(workerId)).current?.id, opened.id);
      assert.equal((await prisma.production.findUniqueOrThrow({ where: { id: production.id } })).status, "PAUSED");
      assert.equal(await prisma.workSession.count({ where: { productionId: production.id, endedAt: null } }), 0);
      await b.finishEmployeeBreak(workerId, opened.id);
      const sessions = await prisma.workSession.findMany({ where: { productionId: production.id }, orderBy: { startedAt: "asc" } });
      const interval = await prisma.employeeBreak.findUniqueOrThrow({ where: { id: opened.id } });
      assert.deepEqual(sessions.map(s => s.kind), ["INITIAL", "RESUME"]);
      assert.equal(sessions[0].endedAt?.getTime(), interval.startedAt.getTime());
      assert.equal(sessions[1].startedAt.getTime(), interval.endedAt?.getTime());
      assert.equal(await prisma.commissionEntry.count({ where: { production: { employeeId: workerId } } }), count);
      assert.equal(await prisma.managementCorrection.count({ where: { employeeBreakId: opened.id } }), 2);
      await assert.rejects(b.startEmployeeBreak(manager.id, "OPERATIONAL"), { status: 403 });
    });
    await t.test("remover revoga acesso sem alterar histórico; restaurar conserva identidade", async () => {
      const history = await prisma.production.findMany({ where: { employeeId: workerId }, include: { sessions: true, commission: true, pausedByBreaks: true }, orderBy: { id: "asc" } });
      const login = await auth.authenticateEmployee(workerId, "5678");
      await admin.changeEmployeeAvailability(manager.id, workerId, false);
      await assert.rejects(auth.authenticateEmployee(workerId, "5678"), { status: 401 });
      assert.equal(await prisma.managementSession.count({ where: { employeeId: workerId, revokedAt: null } }), 0);
      await assert.rejects(h.startHygieneProduction(workerId, "00012300999"), { status: 403 });
      await admin.changeEmployeeAvailability(manager.id, workerId, true);
      assert.equal((await auth.authenticateEmployee(workerId, "5678")).destination, "/producao");
      assert.deepEqual(await prisma.production.findMany({ where: { employeeId: workerId }, include: { sessions: true, commission: true, pausedByBreaks: true }, orderBy: { id: "asc" } }), history);
      assert.ok(login);
      const audits = await prisma.managementCorrection.findMany({ where: { targetId: workerId, action: { in: ["EMPLOYEE_REMOVED", "EMPLOYEE_RESTORED"] } } });
      assert.equal(audits.length, 2);
      await assert.rejects(admin.changeEmployeeAvailability(manager.id, manager.id, false), { status: 400 });
    });
    await t.test("gerente somente produz nos processos atribuídos, sem comissão nova; histórico preservado", async () => {
      const finalization = await import("../services/finalization.service");
      const painting = await import("../services/painting.service");
      const processes = await prisma.processType.findMany({ where: { name: { in: ["Higienização", "Finalização", "Pintura"] } } });
      const code = () => `0${randomInt(1e10, 9e10)}`;
      await assert.rejects(h.startHygieneProduction(manager.id, code()), { status: 403 });
      await assert.rejects(finalization.startFinalizationProduction(manager.id, code(), "PAIR"), { status: 403 });
      await assert.rejects(painting.startPaintingProduction(manager.id, code()), { status: 403 });
      await admin.saveAdministrationEmployee(manager.id, { name: manager.name, roleId: managerRole.id, active: true, processIds: processes.map(p => p.id) }, manager.id);
      for (const flow of ["h", "f", "left", "p"]) {
        const started = flow === "h" ? await h.startHygieneProduction(manager.id, code())
          : flow === "p" ? await painting.startPaintingProduction(manager.id, code())
          : await finalization.startFinalizationProduction(manager.id, code(), flow === "left" ? "LEFT_FOOT" : "PAIR");
        const current = started.current!;
        if (flow === "h") await h.changeHygieneProductionState(manager.id, current.id, current.version, "finish");
        else if (flow === "p") await painting.changePaintingProductionState(manager.id, current.id, current.version, "finish");
        else await finalization.changeFinalizationProductionState(manager.id, current.id, current.version, "finish");
        const saved = await prisma.production.findUniqueOrThrow({ where: { id: current.id }, include: { commission: true, sessions: true } });
        assert.equal(saved.status, "COMPLETED"); assert.equal(saved.commissionAmountSnapshot.toNumber(), 0);
        assert.equal(saved.commission?.amount.toNumber() ?? 0, 0); assert.equal(saved.sessions.length, 1);
      }
      for (const kind of ["BATHROOM", "LUNCH", "OPERATIONAL"] as const) await assert.rejects(b.startEmployeeBreak(manager.id, kind), { status: 403 });
      const before = await prisma.production.findMany({ where: { employeeId: workerId }, include: { commission: true }, orderBy: { id: "asc" } });
      await admin.saveAdministrationEmployee(manager.id, { ...input, roleId: managerRole.id }, workerId);
      assert.deepEqual(await prisma.production.findMany({ where: { employeeId: workerId }, include: { commission: true }, orderBy: { id: "asc" } }), before);
      await admin.saveAdministrationEmployee(manager.id, input, workerId);
    });
    await t.test("estoque: catálogo vazio não é preenchido, permissões, estados, contagem e auditoria", async () => {
      const stock = await import("../services/stock.service");
      const item = await prisma.stockItem.create({ data: { name: prefix } });
      try {
        await assert.rejects(stock.createStockRequest(workerId, { stockItemId: "missing" }), { status: 400 });
        const request = await stock.createStockRequest(workerId, { stockItemId: item.id, quantity: "2.50", note: "observação privada de teste" });
        assert.equal((await stock.listStockRequests(workerId)).pendingStockRequests, 1);
        assert.equal((await stock.listStockRequests(manager.id, { status: "PENDING" })).requests.some(row => row.id === request.id), true);
        await assert.rejects(stock.changeStockRequestStatus(workerId, request.id, "APPROVED"), { status: 403 });
        for (const status of ["APPROVED", "ORDERED", "RECEIVED"]) await stock.changeStockRequestStatus(manager.id, request.id, status);
        assert.equal((await stock.listStockRequests(workerId)).pendingStockRequests, 0);
        await assert.rejects(stock.changeStockRequestStatus(manager.id, request.id, "PENDING"), { status: 409 });
        const handled = await prisma.stockRequest.findUniqueOrThrow({ where: { id: request.id } });
        assert.equal(handled.handledByEmployeeId, manager.id); assert.ok(handled.handledAt);
        const audits = await prisma.managementCorrection.findMany({ where: { targetId: request.id } });
        assert.equal(audits.length, 4); assert.ok(!JSON.stringify(audits).includes("observação privada"));
        await prisma.stockItem.update({ where: { id: item.id }, data: { active: false } });
        await assert.rejects(stock.createStockRequest(workerId, { stockItemId: item.id }), { status: 400 });
        await admin.changeEmployeeAvailability(manager.id, workerId, false);
        await assert.rejects(stock.listStockRequests(workerId), { status: 403 });
        await admin.changeEmployeeAvailability(manager.id, workerId, true);
      } finally {
        await prisma.stockRequest.deleteMany({ where: { stockItemId: item.id } });
        await prisma.stockItem.delete({ where: { id: item.id } });
      }
    });
  } finally {
    if (restoreRule) await prisma.processRule.update({ where: { id: restoreRule.id }, data: { commissionAmount: restoreRule.amount } });
    const owned = await prisma.production.findMany({ where: { employeeId: { in: employees } }, select: { id: true, shoeId: true } });
    await prisma.$transaction(async db => {
      await db.managementCorrection.deleteMany({ where: { actorEmployeeId: { in: employees } } });
      await db.employeeBreak.deleteMany({ where: { employeeId: { in: employees } } });
      await db.workSession.deleteMany({ where: { productionId: { in: owned.map(p => p.id) } } });
      await db.commissionEntry.deleteMany({ where: { productionId: { in: owned.map(p => p.id) } } });
      await db.production.deleteMany({ where: { employeeId: { in: employees }, kind: "RETURN" } });
      await db.production.deleteMany({ where: { employeeId: { in: employees } } });
      await db.shoe.deleteMany({ where: { id: { in: owned.map(p => p.shoeId) }, productions: { none: {} } } });
      await db.managementSession.deleteMany({ where: { employeeId: { in: employees } } });
      await db.employeeProcess.deleteMany({ where: { employeeId: { in: employees } } });
      await db.employee.deleteMany({ where: { id: { in: employees } } });
      await db.rolePermission.deleteMany({ where: { roleId: { in: roles } } });
      await db.role.deleteMany({ where: { id: { in: roles } } });
    });
    await prisma.$disconnect();
  }
});
