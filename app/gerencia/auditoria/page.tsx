import { requirePageAccess } from "@/lib/auth-page";
import { MANAGEMENT_PERMISSION } from "@/utils/access";
import { AdminNavigation } from "@/components/management/admin-navigation";
import { AuditAdministration } from "@/components/management/admin-panels";
import { LogoutButton } from "@/components/auth/logout-button";
export const dynamic = "force-dynamic";
export default async function Page() {
  const employee = await requirePageAccess(MANAGEMENT_PERMISSION);
  return <main className="mx-auto min-h-screen max-w-6xl space-y-5 px-4 py-6"><header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl font-semibold">Auditoria administrativa</h1><p>{employee.name}</p></div><LogoutButton /></header><AdminNavigation /><AuditAdministration /></main>;
}
