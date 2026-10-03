import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FinalizationReader } from "../components/production/finalization-reader";

test("Finalização já exibe produção e tempo do overview antes da hidratação", () => {
  const html = renderToStaticMarkup(createElement(FinalizationReader, {
    employeeName: "QA", canUseBreaks: false,
    initialOverview: { current: { id: "production", code: "00092420260001", processName: "Finalização", unit: "PAIR",
      status: "IN_PROGRESS", version: 1, elapsedMilliseconds: 123000, observedAt: "2026-10-01T12:00:00Z" }, deferred: [] },
  }));
  assert.match(html, /00092420260001/);
  assert.match(html, /00:02:03/);
  assert.doesNotMatch(html, /Pausa banheiro|Pausa almoço|Pausa operacional/i);
});
