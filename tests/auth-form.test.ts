import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { AuthForm } from "../components/auth/auth-form";
import { authErrorResponse, readJsonObject } from "../lib/auth-http";

for (const mode of ["login", "change-pin"] as const) {
  test(`${mode}: HTML anterior à hidratação envia credenciais por POST para endereço fixo`, () => {
    const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch() {} };
    const props = mode === "login" ? { mode, employees: [{ id: "employee", name: "Teste" }] } : { mode };
    const html = renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router }, createElement(AuthForm, props)));
    const form = html.match(/<form\b[^>]*>/)?.[0];
    assert.ok(form);
    assert.match(form, /method="post"/);
    assert.match(form, new RegExp(`action="/api/auth/${mode}"`));
    assert.doesNotMatch(form, /\?|formMethod|formAction/i);
    assert.doesNotMatch(html, /formmethod|formaction/i);
    assert.match(html, /type="submit"/);
    assert.match(html, /type="password"/);
  });

  test(`${mode}: POST nativo sem JavaScript é recusado sem ecoar o PIN`, async () => {
    const pin = "9876";
    const body = new URLSearchParams(mode === "login" ? { employeeId: "employee", pin } : { newPin: pin, confirmPin: pin });
    const request = new Request(`http://localhost/api/auth/${mode}`, { method: "POST", body });
    let response: Response | undefined;
    try { await readJsonObject(request); } catch (error) { response = authErrorResponse(error); }
    assert.ok(response);
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("location"), null);
    assert.equal(new URL(request.url).search, "");
    assert.ok(!(await response.text()).includes(pin));
  });
}
