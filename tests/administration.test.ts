import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { prisma } from "./fake-prisma";
import { commissionValue, resetAdministrationPin, saveAdministrationEmployee, updateAdministrationCommission } from "../services/administration.service";

afterEach(() => mock.restoreAll());
test("comissão aceita centavos e rejeita valores negativos, ausentes, excessivos ou com terceira casa", () => {
  for (const [input, expected] of [["0", "0.00"], ["0,50", "0.50"], ["9999.99", "9999.99"]]) assert.equal(commissionValue(input).toFixed(2), expected);
  for (const value of ["", null, 0.5, "-0.01", "10000", "0.001", "1e2", "NaN"]) assert.throws(() => commissionValue(value), { status: 400 });
});
test("administração recusa funcionário operacional em todas as escritas", async () => {
  mock.method(prisma, "$queryRaw", async () => []);
  mock.method(prisma.employee, "findFirst", async () => null);
  const input = { name: "QA", roleId: "role", active: true, processIds: [], pin: "1234" };
  for (const operation of [
    () => saveAdministrationEmployee("worker", input),
    () => saveAdministrationEmployee("worker", input, "employee"),
    () => resetAdministrationPin("worker", "employee", "1234"),
    () => updateAdministrationCommission("worker", "rule", "0.60"),
  ]) await assert.rejects(operation(), { code: "FORBIDDEN", status: 403 });
});
