import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import type { Prisma } from "../lib/generated/prisma/client";
import { prisma } from "./fake-prisma";
import { getManagementDashboard } from "../services/management.service";

afterEach(() => mock.restoreAll());

test("relatório separa banheiro e almoço, recorta o período e ignora processo nos intervalos", async () => {
  mock.method(prisma.production, "findMany", async () => []);
  mock.method(prisma.employee, "findMany", async () => []);
  mock.method(prisma.processType, "findMany", async () => []);
  const employee = { id: "e1", name: "Funcionário de teste" };
  mock.method(prisma.employeeBreak, "findMany", async (args: Prisma.EmployeeBreakFindManyArgs) => {
    assert.equal(args.where?.employeeId, employee.id);
    assert.equal(Object.hasOwn(args.where!, "processTypeId"), false);
    return [
      { id: "bathroom", kind: "BATHROOM", employee, startedAt: new Date("2026-09-10T08:55:00Z"), endedAt: new Date("2026-09-10T09:05:00Z") },
      { id: "lunch", kind: "LUNCH", employee, startedAt: new Date("2026-09-10T09:30:00Z"), endedAt: new Date("2026-09-10T10:30:00Z") },
      { id: "open", kind: "BATHROOM", employee, startedAt: new Date("2026-09-10T09:58:00Z"), endedAt: null },
    ];
  });
  const data = await getManagementDashboard({ start: new Date("2026-09-10T09:00:00Z"), endExclusive: new Date("2026-09-10T10:00:00Z"), employeeId: employee.id, processTypeId: "painting" });
  assert.equal(data.totalBathroomMs, 7 * 60_000);
  assert.equal(data.totalLunchMs, 30 * 60_000);
  assert.equal(data.totalBreakMs, 37 * 60_000);
  assert.equal(data.totals.workedMs, 0);
  assert.equal(data.totals.earnedCommissionCents, 0);
});
