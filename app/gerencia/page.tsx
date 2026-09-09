import { requirePageAccess } from "@/lib/auth-page";
import { MANAGEMENT_PERMISSION } from "@/utils/access";
import { WorkspaceHome } from "@/components/workspace-home";

export default async function ManagementPage() {
  const employee = await requirePageAccess(MANAGEMENT_PERMISSION);
  return <WorkspaceHome name={employee.name} management canAccessManagement={employee.canAccessManagement} />;
}
