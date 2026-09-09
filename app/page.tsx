import Image from "next/image";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/auth-form";
import { currentEmployee } from "@/lib/auth-page";
import { listEmployeesForLogin } from "@/services/auth.service";

export default async function Home() {
  const employee = await currentEmployee();

  if (employee) {
    redirect(employee.destination);
  }

  const employees = await listEmployeesForLogin();

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <section className="w-full max-w-md rounded-[28px] border border-(--border) bg-(--surface) p-6 shadow-2xl sm:p-8">
        <div className="mb-8 flex justify-center">
          <Image
            src="/newshoes-logo.png"
            alt="New Shoes"
            width={220}
            height={80}
            priority
            className="h-auto w-52"
          />
        </div>

        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-(--brand)">
            New Shoes Control
          </p>

          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-(--text-primary)">
            Acesso ao sistema
          </h1>

          <p className="mt-3 text-sm leading-6 text-(--text-secondary)">
            Selecione seu nome e informe seu PIN para entrar.
          </p>
        </div>

        {employees.length === 0 && (
          <p
            role="status"
            className="mb-5 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-300"
          >
            Nenhum funcionário disponível. Procure a gerência.
          </p>
        )}

        <AuthForm mode="login" employees={employees} />

        <p className="mt-8 text-center text-xs text-(--text-muted)">
          Sistema interno de produção
        </p>
      </section>
    </main>
  );
}