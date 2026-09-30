import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import "./fake-prisma";
import { workflowFixture } from "./workflow-fixture";
import { isValidShoeCode, normalizeShoeCode, SHOE_CODE_ERROR } from "../utils/shoe-code";
import { startHygieneProduction, finishAndStartNextHygieneProduction, changeHygieneProductionState } from "../services/production.service";
import { startFinalizationProduction } from "../services/finalization.service";
import { startPaintingProduction } from "../services/painting.service";
import { getQualityReturnCandidates, requestQualityReturn, changeReturnState } from "../services/return.service";

afterEach(() => mock.restoreAll());

for (const code of ["000123", "33333333333333", "00092420260001", "0", "0".repeat(64)]) {
  test(`código ${code}: Higienização, Finalização, Pintura e Retorno preservam a string`, async () => {
    const { employeeId, records } = workflowFixture();
    assert.equal(isValidShoeCode(code), true);
    assert.equal(normalizeShoeCode(code), code);
    const hygiene = await startHygieneProduction(employeeId, code);
    assert.equal(hygiene.current?.code, code);
    await changeHygieneProductionState(employeeId, hygiene.current!.id, 0, "finish");
    const candidates = await getQualityReturnCandidates(code);
    assert.equal(candidates[0].shoe.code, code);
    const pending = await requestQualityReturn(hygiene.current!.id, "Conferência do código");
    const returned = await changeReturnState(employeeId, pending.id, pending.version, "start");
    assert.ok(returned.some(item => item.code === code));
    assert.equal(records.at(-1)?.shoeId, records[0].shoeId);
    const finalization = await startFinalizationProduction(employeeId, code, "PAIR");
    assert.equal(finalization.current?.code, code);
    const painting = await startPaintingProduction(employeeId, code);
    assert.equal(painting.current?.code, code);
    assert.equal(records.at(-2)?.status, "DEFERRED");
    assert.ok(records.every(record => record.shoeId === `shoe-${code}`));
  });
}

test("Finalizar e iniciar outro preserva os 14 dígitos e troca de trabalho preserva o próximo código", async () => {
  const { employeeId, records } = workflowFixture();
  const first = await startHygieneProduction(employeeId, "000123");
  const next = await finishAndStartNextHygieneProduction(employeeId, first.current!.id, first.current!.version, "00092420260001");
  assert.equal(next.current?.code, "00092420260001");
  assert.equal(records[0].status, "COMPLETED");
  const switched = await startHygieneProduction(employeeId, "33333333333333");
  assert.equal(switched.current?.code, "33333333333333");
  assert.equal(records[1].status, "DEFERRED");
});

for (const invalid of ["1".repeat(65), "000123abc", "000 123", "", 123, null]) {
  test(`código inválido (${String(invalid).length} caracteres, ${typeof invalid}): rejeitado antes de alterar o trabalho`, async () => {
    const { employeeId, records, commissions } = workflowFixture();
    const first = await startHygieneProduction(employeeId, "000123");
    const before = JSON.stringify({ records, commissions });
    const code = invalid as string;
    const error = { code: "INVALID_INPUT", status: 400, message: SHOE_CODE_ERROR };
    assert.equal(isValidShoeCode(invalid), false);
    assert.throws(() => normalizeShoeCode(invalid), error);
    await assert.rejects(startHygieneProduction(employeeId, code), error);
    await assert.rejects(finishAndStartNextHygieneProduction(employeeId, first.current!.id, 0, code), error);
    await assert.rejects(startFinalizationProduction(employeeId, code, "PAIR"), error);
    await assert.rejects(startPaintingProduction(employeeId, code), error);
    await assert.rejects(getQualityReturnCandidates(code), error);
    assert.deepEqual(JSON.stringify({ records, commissions }), before);
  });
}
