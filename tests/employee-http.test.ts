import assert from "node:assert/strict";
import { randomUUID, randomInt } from "node:crypto";
import { test } from "node:test";
import { hash } from "bcryptjs";
import "dotenv/config";

test("telas e API do funcionário usam exclusivamente a sessão (HTTP local)", { skip: !process.env.EMPLOYEE_HTTP_TEST_URL }, async t => {
  const base = new URL(process.env.EMPLOYEE_HTTP_TEST_URL!);
  const database = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["localhost", "127.0.0.1"].includes(base.hostname));
  assert.ok(["localhost", "127.0.0.1"].includes(database.hostname));
  const { prisma } = await import("../lib/prisma");
  const prefix = `QA HTTP ${randomUUID()}`;
  const employees: string[] = [];
  const shoes: string[] = [];
  const roles: string[] = [];
  try {
    const role = await prisma.role.create({ data: { name: prefix } }); roles.push(role.id);
    const permission = await prisma.permission.findUniqueOrThrow({ where: { code: "management.access" } });
    const managerRole = await prisma.role.create({ data: { name: `${prefix} gerente`, permissions: { create: { permissionId: permission.id } } } }); roles.push(managerRole.id);
    const hygiene = await prisma.processType.findUniqueOrThrow({ where: { name: "Higienização" } });
    const pinHash = await hash("1234", 4);
    for (const roleId of roles) {
      const employee = await prisma.employee.create({ data: { name: `${prefix} ${employees.length}`, roleId, pinHash, mustChangePin: false, processes: { create: { processTypeId: hygiene.id } } } }); employees.push(employee.id);
    }
    // Ensure the running app really uses this test database before attempting login.
    const publicUsers = JSON.stringify(await (await fetch(new URL("/api/employees", base))).json());
    assert.ok(employees.every(id => publicUsers.includes(id)), "Aplicativo e teste devem usar o mesmo banco local");
    async function login(id: string) {
      const response = await fetch(new URL("/api/auth/login", base), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employeeId: id, pin: "1234" }) });
      assert.equal(response.status, 200);
      return response.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
    }
    const workerCookie = await login(employees[0]);
    const managerCookie = await login(employees[1]);
    async function call(path: string, cookie: string, body?: object, method = "POST") {
      return fetch(new URL(path, base), { redirect: "manual", headers: { Cookie: cookie, "Content-Type": "application/json" }, ...(body ? { method, body: JSON.stringify(body) } : {}) });
    }
    let productionId = "", version = 0;
    await t.test("funcionário não consulta outro ID; páginas sem sessão redirecionam e API recusa", async () => {
      for (const path of ["/producao/minha-producao", "/producao/meus-trabalhos"]) {
        assert.equal((await call(path, "")).status, 307);
        const response = await call(`${path}?employeeId=${employees[1]}`, workerCookie);
        assert.equal(response.status, 200); const html = await response.text();
        assert.ok(html.includes(`${prefix} 0`)); assert.ok(!html.includes(`${prefix} 1`));
      }
      assert.equal((await call("/api/production/my-work", "")).status, 401);
      assert.equal((await call("/gerencia", workerCookie)).status, 307);
    });
    await t.test("API mantém dono da sessão, código integral e produção única ao reabrir", async () => {
      const code = `000${randomInt(1e10, 9e10)}`;
      const created = await call("/api/production/hygiene", workerCookie, { code, employeeId: employees[1] });
      assert.equal(created.status, 200); const current = (await created.json()).current; productionId = current.id;
      const original = await prisma.production.findUniqueOrThrow({ where: { id: productionId } }); shoes.push(original.shoeId);
      assert.equal(original.employeeId, employees[0]);
      assert.equal((await call("/api/production/hygiene", workerCookie, { productionId, version: current.version, action: "finish" }, "PATCH")).status, 200);
      const completed = await prisma.production.findUniqueOrThrow({ where: { id: productionId }, include: { commission: true } });
      const response = await call("/api/production/my-work", workerCookie, { productionId, version: completed.version, employeeId: employees[1] });
      assert.equal(response.status, 200); version = (await response.json()).version;
      const list = await (await call(`/api/production/my-work?employeeId=${employees[1]}`, workerCookie)).json();
      assert.ok(list.works.some((w: { id: string; code: string }) => w.id === productionId && w.code === code));
      assert.equal((await call("/api/production/my-work", managerCookie, { productionId, version })).status, 404);
      assert.equal((await call("/api/production/my-work", workerCookie, { productionId, version: completed.version })).status, 409);
      assert.equal((await call("/api/production/hygiene", workerCookie, { productionId, version, action: "finish" }, "PATCH")).status, 200);
      assert.deepEqual(await prisma.commissionEntry.findUnique({ where: { productionId } }), completed.commission);
      assert.equal(await prisma.production.count({ where: { shoeId: original.shoeId } }), 1);
    });
    await t.test("mês anterior é aceito e mês inválido é recusado na página", async () => {
      const html = await (await call("/producao/minha-producao?month=2026-09", workerCookie)).text();
      assert.ok(html.includes('value="2026-09"'));
      const invalid = await (await call("/producao/minha-producao?month=2026-13", workerCookie)).text();
      assert.ok(invalid.includes("Selecione um mês válido."));
    });
    await t.test("Gerência busca código e anula/restaura; trabalhador recebe 403", async () => {
      const code = `000${randomInt(1e10, 9e10)}`;
      const initial = await call("/api/production/hygiene", workerCookie, { code, newOccurrence: true, expectedLatestId: null });
      assert.equal(initial.status, 200);
      const current = (await initial.json()).current;
      const original = await prisma.production.findUniqueOrThrow({ where: { id: current.id } }); shoes.push(original.shoeId);
      await call("/api/production/hygiene", workerCookie, { productionId: current.id, version: current.version, action: "finish" }, "PATCH");
      const completed = await prisma.production.findUniqueOrThrow({ where: { id: current.id }, include: { sessions: true, commission: true } });
      assert.equal((await call(`/api/production/occurrences?code=${code}`, "")).status, 401);
      const occurrences = await call(`/api/production/occurrences?code=${code}`, workerCookie);
      assert.equal(occurrences.status, 200); assert.match(occurrences.headers.get("cache-control")!, /no-store/);
      assert.equal((await call("/gerencia/registros", workerCookie)).status, 307);
      const page = await call(`/gerencia/registros?code=${code}`, managerCookie);
      assert.equal(page.status, 200); const html = await page.text();
      assert.ok(html.includes(code)); assert.ok(html.includes("Anular registro"));
      const body = { id: completed.id, version: completed.version, action: "cancel", reason: "QA HTTP" };
      assert.equal((await call("/api/management/productions", "", body)).status, 401);
      assert.equal((await call("/api/management/productions", workerCookie, body)).status, 403);
      assert.equal((await call("/api/management/productions", managerCookie, { ...body, reason: "" })).status, 400);
      const cancelled = await call("/api/management/productions", managerCookie, body);
      assert.equal(cancelled.status, 200); const result = await cancelled.json();
      const cancelledPage = await (await call(`/gerencia/registros?code=${code}`, managerCookie)).text();
      assert.ok(cancelledPage.includes("Restaurar registro"));
      assert.equal((await call("/api/management/productions", managerCookie, { ...body, version: result.version, action: "restore" })).status, 200);
      const restored = await prisma.production.findUniqueOrThrow({ where: { id: completed.id }, include: { sessions: true, commission: true } });
      assert.deepEqual(restored.sessions, completed.sessions); assert.deepEqual(restored.commission, completed.commission);
    });
    await t.test("gerente produtor mantém produtividade com comissão zero e acesso administrativo", async () => {
      const created = await call("/api/production/hygiene", managerCookie, { code: `000${randomInt(1e10, 9e10)}` });
      const current = (await created.json()).current;
      const original = await prisma.production.findUniqueOrThrow({ where: { id: current.id } }); shoes.push(original.shoeId);
      assert.equal((await call("/api/production/hygiene", managerCookie, { productionId: current.id, version: current.version, action: "finish" }, "PATCH")).status, 200);
      const ledger = await prisma.commissionEntry.findUniqueOrThrow({ where: { productionId: current.id } }); assert.equal(ledger.amount.toString(), "0");
      assert.equal((await call("/gerencia", managerCookie)).status, 200);
      const html = await (await call("/producao/minha-producao", managerCookie)).text();
      assert.ok(html.includes("1 pares")); assert.ok(html.includes("0,00"));
    });
  } finally {
    const owned = { employeeId: { in: employees } };
    await prisma.managementCorrection.deleteMany({ where: { actorEmployeeId: { in: employees } } });
    await prisma.managementSession.deleteMany({ where: owned });
    await prisma.commissionEntry.deleteMany({ where: { production: owned } });
    await prisma.workSession.deleteMany({ where: { production: owned } });
    await prisma.production.deleteMany({ where: owned });
    await prisma.employeeProcess.deleteMany({ where: owned });
    await prisma.employee.deleteMany({ where: { id: { in: employees }, roleId: { in: roles } } });
    await prisma.shoeOccurrence.deleteMany({ where: { shoeId: { in: shoes } } });
    await prisma.shoe.deleteMany({ where: { id: { in: shoes } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: roles } } });
    await prisma.role.deleteMany({ where: { id: { in: roles } } });
    await prisma.$disconnect();
  }
});
