export const MANAGEMENT_PERMISSION = "management.access";

interface AccessEmployee {
  active: boolean;
  mustChangePin: boolean;
  role: {
    active: boolean;
    permissions: { permission: { code: string } }[];
  };
}

export function hasPermission(employee: AccessEmployee, permission: string) {
  return employee.active && employee.role.active &&
    employee.role.permissions.some((entry) => entry.permission.code === permission);
}

export function getAccessProfile(employee: AccessEmployee) {
  const canAccessManagement = hasPermission(employee, MANAGEMENT_PERMISSION);
  return {
    canAccessManagement,
    destination: employee.mustChangePin
      ? "/trocar-pin"
      : canAccessManagement ? "/gerencia" : "/producao",
  };
}
