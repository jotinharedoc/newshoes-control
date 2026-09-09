import { requirePageAccess } from "@/lib/auth-page";
import { WorkspaceHome } from "@/components/workspace-home";

export default async function ProductionPage() {
  const employee = await requirePageAccess();
  return <WorkspaceHome name={employee.name} management={false} canAccessManagement={employee.canAccessManagement} />;
}
