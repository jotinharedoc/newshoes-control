import Image from "next/image";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/auth-form";
import { LogoutButton } from "@/components/auth/logout-button";
import { currentEmployee } from "@/lib/auth-page";

export default async function ChangePinPage() {
  const employee = await currentEmployee();

  if (!employee) {
    redirect("/");
  }

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
            {employee.mustChangePin ? "Crie seu PIN" : "Alterar PIN"}
          </h1>

          <p className="mt-3 text-sm leading-6 text-(--text-secondary)">
            Olá, {employee.name}.{" "}
            {employee.mustChangePin
              ? "Antes de continuar, substitua seu PIN provisório."
              : "Informe e confirme seu novo PIN."}
          </p>
        </div>

        <AuthForm mode="change-pin" />

        <div className="mt-6 border-t border-(--border) pt-6 text-center">
          <LogoutButton />
        </div>
      </section>
    </main>
  );
}