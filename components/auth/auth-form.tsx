"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type Props =
  | { mode: "login"; employees: { id: string; name: string }[] }
  | { mode: "change-pin" };

export function AuthForm(props: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const login = props.mode === "login";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    const body = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch(`/api/auth/${props.mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error?.message ?? "Não foi possível continuar.");
        setPending(false);
        return;
      }
      router.replace(result.destination);
      router.refresh();
    } catch {
      setError("Não foi possível conectar. Verifique a conexão e tente novamente.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <fieldset disabled={pending} className="space-y-5 disabled:opacity-60">
        {props.mode === "login" && (
          <label className="block text-sm font-medium">
            Funcionário
            <select name="employeeId" required defaultValue="" className="auth-input">
              <option value="" disabled>Selecione seu nome</option>
              {props.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
            </select>
          </label>
        )}
        <label className="block text-sm font-medium">
          {login ? "PIN" : "Novo PIN"}
          <input className="auth-input" name={login ? "pin" : "newPin"} type="password" inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} autoComplete={login ? "current-password" : "new-password"} required aria-describedby="pin-hint" />
        </label>
        <p id="pin-hint" className="text-sm text-slate-500">Use quatro números.{!login && " Escolha um PIN diferente do provisório e do atual."}</p>
        {!login && (
          <label className="block text-sm font-medium">
            Confirme o novo PIN
            <input className="auth-input" name="confirmPin" type="password" inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} autoComplete="new-password" required />
          </label>
        )}
        <button className="primary-button w-full" type="submit" disabled={props.mode === "login" && props.employees.length === 0}>
          {pending ? "Aguarde…" : login ? "Entrar" : "Salvar PIN"}
        </button>
      </fieldset>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </form>
  );
}
