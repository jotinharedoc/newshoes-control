import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { workflowFixture } from "./workflow-fixture";
import { readOccurrenceChoice } from "../services/shoe-occurrence.service";
import { startHygieneProduction, changeHygieneProductionState } from "../services/production.service";

afterEach(() => mock.restoreAll());
test("escolha de ocorrência rejeita tipos inválidos e novo uso sem consulta prévia", async () => {
  for (const input of [{ occurrenceId: 1 }, { occurrenceId: "" }, { newOccurrence: "true" }, { expectedLatestId: 123 }]) {
    assert.throws(() => readOccurrenceChoice(input), { status: 400 });
  }
  const state = workflowFixture();
  await assert.rejects(startHygieneProduction(state.employeeId, "123456", { newOccurrence: true }), { status: 400 });
  assert.equal(state.records.length, 0);
});
test("novo tênis conserva uso concluído e a mesma ocorrência impede duplicação", async () => {
  const state = workflowFixture();
  const first = (await startHygieneProduction(state.employeeId, "999999", { newOccurrence: true, expectedLatestId: null })).current!;
  await changeHygieneProductionState(state.employeeId, first.id, first.version, "finish");
  const original = state.records[0];
  const snapshot = structuredClone({ id: original.id, occurrenceId: original.occurrenceId, sessions: original.sessions });
  await assert.rejects(startHygieneProduction(state.employeeId, "999999", { occurrenceId: original.occurrenceId }), { status: 409 });
  const next = (await startHygieneProduction(state.employeeId, "999999", { newOccurrence: true, expectedLatestId: original.occurrenceId })).current!;
  assert.notEqual(next.id, first.id);
  assert.notEqual(state.records[1].occurrenceId, original.occurrenceId);
  assert.deepEqual({ id: original.id, occurrenceId: original.occurrenceId, sessions: original.sessions }, snapshot);
  assert.equal(state.commissions.length, 1);
});
