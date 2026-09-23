import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { prisma } from "./fake-prisma";
import { workflowFixture, type WorkRecord } from "./workflow-fixture";
import { startEmployeeBreak, finishEmployeeBreak } from "../services/employee-break.service";
import { startHygieneProduction, changeHygieneProductionState, finishAndStartNextHygieneProduction } from "../services/production.service";
import { startFinalizationProduction, changeFinalizationProductionState } from "../services/finalization.service";
import { startPaintingProduction, changePaintingProductionState } from "../services/painting.service";
import { requestQualityReturn, changeReturnState } from "../services/return.service";

afterEach(() => { mock.restoreAll(); mock.timers.reset(); });

type Flow = "Higienização" | "Finalização" | "Pintura" | "Retorno";
const flows: Flow[] = ["Higienização", "Finalização", "Pintura", "Retorno"];
type State = ReturnType<typeof workflowFixture>;

async function change(state: State, record: WorkRecord, action: "pause" | "resume" | "continue" | "defer" | "finish", version = record.version) {
  const args = [state.employeeId, record.id, version] as const;
  if (record.kind === "RETURN") return changeReturnState(...args, action === "continue" ? "start" : action);
  if (record.processTypeId === "Higienização") return changeHygieneProductionState(...args, action);
  if (record.processTypeId === "Finalização") return changeFinalizationProductionState(...args, action);
  return changePaintingProductionState(...args, action);
}

async function start(state: State, flow: Flow, code: string) {
  if (flow === "Higienização") await startHygieneProduction(state.employeeId, code);
  if (flow === "Finalização") await startFinalizationProduction(state.employeeId, code, "PAIR");
  if (flow === "Pintura") await startPaintingProduction(state.employeeId, code);
  if (flow === "Retorno") {
    // Um serviço original concluído gera uma solicitação real de qualidade.
    const source = state.records.find(r => r.shoeId === `shoe-${code}` && r.kind === "STANDARD");
    assert.ok(source);
    const returned = await requestQualityReturn(source.id, "Ajustar acabamento");
    await changeReturnState(state.employeeId, returned.id, returned.version, "start");
  }
  return state.records.at(-1)!;
}

async function prepareReturn(state: State, code: string) {
  const source = await start(state, "Pintura", code);
  await change(state, source, "finish");
  return source;
}

for (const flow of flows) {
  for (const kind of ["BATHROOM", "LUNCH"] as const) {
    test(`${flow}: ${kind} registra intervalo, preserva duração e aplica RESUME/CONTINUATION`, async () => {
      mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-22T12:00:00Z") });
      const state = workflowFixture();
      if (flow === "Retorno") await prepareReturn(state, "001001");
      const record = await start(state, flow, "001001");
      const originalCount = state.records.length;
      const originalCommissions = state.commissions.length;
      mock.timers.tick(120_000);

      if (kind === "BATHROOM") await change(state, record, "pause");
      else await startEmployeeBreak(state.employeeId, kind);
      assert.equal(state.breaks.length, 1);
      assert.equal(state.breaks[0].pausedProductionId, record.id);
      assert.equal(state.breaks[0].kind, kind);
      assert.equal(record.status, kind === "BATHROOM" ? "PAUSED" : "DEFERRED");
      assert.equal(record.sessions[0].endedAt!.getTime() - record.sessions[0].startedAt.getTime(), 120_000);
      assert.equal(state.commissions.length, originalCommissions);
      await assert.rejects(change(state, record, "finish"), { code: "INVALID_PRODUCTION_STATE" });

      mock.timers.tick(kind === "BATHROOM" ? 600_000 : 3_600_000);
      if (kind === "BATHROOM") await change(state, record, "resume");
      else {
        await finishEmployeeBreak(state.employeeId, state.breaks[0].id);
        assert.equal(record.status, "DEFERRED");
        assert.equal(record.sessions.filter(s => !s.endedAt).length, 0);
        await change(state, record, "continue");
      }
      assert.ok(state.breaks[0].endedAt);
      assert.equal(record.sessions.at(-1)?.kind, kind === "BATHROOM" ? "RESUME" : "CONTINUATION");
      assert.equal(state.records.length, originalCount);
      mock.timers.tick(180_000);
      await change(state, record, "finish");
      const worked = record.sessions.reduce((sum, s) => sum + s.endedAt!.getTime() - s.startedAt.getTime(), 0);
      assert.equal(worked, 300_000, "intervalo não entra no tempo produtivo");
      assert.equal(state.commissions.length, originalCommissions + (flow === "Retorno" ? 0 : 1));
      if (flow !== "Retorno") assert.equal(state.commissions.at(-1)?.amount, flow === "Pintura" ? "1" : "0.5");
      await assert.rejects(change(state, record, "finish"), { code: "INVALID_PRODUCTION_STATE" });
    });
  }
}

for (const from of flows) {
  for (const to of flows) {
    test(`troca ${from} → ${to}: DEFERRED, tempo salvo, uma sessão aberta e nenhuma comissão nova`, async () => {
      const state = workflowFixture();
      if (from === "Retorno") await prepareReturn(state, "001001");
      if (to === "Retorno") await prepareReturn(state, "001002");
      const first = await start(state, from, "001001");
      const commissionsBefore = state.commissions.length;
      const second = await start(state, to, "001002");
      assert.equal(first.status, "DEFERRED");
      assert.equal(first.sessions.at(-1)?.endReason, "DEFERRED");
      assert.ok(first.sessions.at(-1)?.endedAt);
      assert.equal(second.status, "IN_PROGRESS");
      assert.equal(state.records.filter(r => r.status === "IN_PROGRESS").length, 1);
      assert.equal(state.records.flatMap(r => r.sessions).filter(s => !s.endedAt).length, 1);
      assert.equal(state.commissions.length, commissionsBefore);
      const count = state.records.length;
      await change(state, first, "continue");
      assert.equal(second.status, "DEFERRED");
      assert.equal(first.sessions.at(-1)?.kind, "CONTINUATION");
      assert.equal(state.records.length, count);
      assert.equal(state.commissions.length, commissionsBefore);
    });
  }
}

test("finalizar e iniciar outro conclui e paga o anterior, preservando zeros do código", async () => {
  const state = workflowFixture();
  const first = await start(state, "Higienização", "001001");
  const next = await finishAndStartNextHygieneProduction(state.employeeId, first.id, first.version, "001002");
  assert.equal(first.status, "COMPLETED");
  assert.equal(state.commissions.length, 1);
  assert.equal(next.current?.code, "001002");
  assert.equal(first.sessions.at(-1)?.endReason, "NEXT_QR_SCAN");
});

test("versão antiga não inicia banheiro nem encerra o intervalo corrente", async () => {
  const state = workflowFixture();
  const record = await start(state, "Pintura", "001001");
  await assert.rejects(change(state, record, "pause", record.version + 1), { code: "PRODUCTION_CONFLICT" });
  assert.equal(state.breaks.length, 0);
  await change(state, record, "pause");
  await assert.rejects(change(state, record, "resume", record.version - 1), { code: "PRODUCTION_CONFLICT" });
  assert.equal(state.breaks[0].endedAt, null);
});

test("retorno não pode encerrar banheiro vinculado a outro trabalho", async () => {
  const state = workflowFixture();
  await prepareReturn(state, "001001");
  const returned = await start(state, "Retorno", "001001");
  const standard = await start(state, "Higienização", "001002");
  await change(state, standard, "pause");
  await assert.rejects(change(state, returned, "resume"), { code: "INVALID_PRODUCTION_STATE" });
  assert.equal(state.breaks[0].endedAt, null);
});

test("conflito ao pausar não cria intervalo nem comissão", async () => {
  const state = workflowFixture();
  const record = await start(state, "Pintura", "001001");
  mock.method(prisma.production, "updateMany", async () => ({ count: 0 }));
  await assert.rejects(change(state, record, "pause"), { code: "PRODUCTION_CONFLICT" });
  assert.equal(state.breaks.length, 0);
  assert.equal(state.commissions.length, 0);
});
