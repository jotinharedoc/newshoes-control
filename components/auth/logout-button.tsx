"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("logout failed");
      router.replace("/");
      router.refresh();
    } catch {
      setError("Não foi possível sair. Tente novamente.");
      setPending(false);
    }
  }
  return <div><button type="button" onClick={logout} disabled={pending} className="text-sm font-semibold text-teal-800 underline disabled:opacity-50">{pending ? "Saindo…" : "Sair"}</button>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}</div>;
}
