import assert from "node:assert/strict";
import { test } from "node:test";
import "./fake-prisma";
import { assertStockTransition, parseStockQuantity, parseStockStatus } from "../services/stock.service";

test("estoque valida status e quantidades sem arredondar silenciosamente", () => {
  assert.equal(parseStockStatus("PENDING"), "PENDING");
  assert.equal(parseStockQuantity("1,25")?.toString(), "1.25");
  assert.equal(parseStockQuantity(undefined), null);
  for (const quantity of [0, -1, "1.001", "1e3", "100000000", {}, Infinity]) assert.throws(() => parseStockQuantity(quantity), { status: 400 });
  for (const status of ["ANY", "", null, 4]) assert.throws(() => parseStockStatus(status), { status: 400 });
});
test("estoque permite fluxo aprovado/pedido/recebido e impede regressão ou repetição", () => {
  assertStockTransition("PENDING", "APPROVED");
  assertStockTransition("APPROVED", "ORDERED");
  assertStockTransition("ORDERED", "RECEIVED");
  assertStockTransition("PENDING", "REJECTED");
  assertStockTransition("PENDING", "CANCELLED");
  assert.throws(() => assertStockTransition("PENDING", "RECEIVED"), { status: 409 });
  assert.throws(() => assertStockTransition("RECEIVED", "PENDING"), { status: 409 });
  assert.throws(() => assertStockTransition("APPROVED", "APPROVED"), { status: 409 });
});
