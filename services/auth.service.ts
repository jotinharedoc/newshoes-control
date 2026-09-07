import { compare } from "bcryptjs";

import {
  findActiveEmployees,
  findEmployeeForAuthentication,
  registerFailedPinAttempt,
  resetPinAttempts,
} from "@/repositories/employee.repository";
import { createManagementSession } from "@/repositories/management-session.repository";
import { AuthError } from "@/types/auth.types";
import {
  authConfig,
  createSessionExpiration,
  createSessionToken,
  hashSessionToken,
} from "@/utils/auth";

const MANAGEMENT_PERMISSION = "management.access";

export async function listEmployeesForLogin() {
  const employees = await findActiveEmployees();

  return employees.map((employee) => ({
    id: employee.id,
    name: employee.name,
  }));
}

export async function authenticateEmployee(
  employeeId: string,
  pin: string,
) {
  if (!employeeId || !/^\d{4}$/.test(pin)) {
    throw new AuthError(
      "INVALID_INPUT",
      "Selecione um funcionário e informe um PIN de quatro números.",
      400,
    );
  }

  const employee = await findEmployeeForAuthentication(employeeId);

  if (!employee?.pinHash) {
    throw new AuthError(
      "INVALID_CREDENTIALS",
      "Funcionário ou PIN inválido.",
      401,
    );
  }

  const now = new Date();

  const lockIsActive =
    employee.pinLockedUntil &&
    employee.pinLockedUntil.getTime() > now.getTime();

  if (lockIsActive) {
    throw new AuthError(
      "ACCOUNT_LOCKED",
      "Muitas tentativas incorretas. Aguarde antes de tentar novamente.",
      429,
    );
  }

  const previousAttempts =
    employee.pinLockedUntil &&
    employee.pinLockedUntil.getTime() <= now.getTime()
      ? 0
      : employee.failedPinAttempts;

  const pinIsValid = await compare(pin, employee.pinHash);

  if (!pinIsValid) {
    const failedPinAttempts = previousAttempts + 1;

    const reachedLimit =
      failedPinAttempts >= authConfig.maxFailedAttempts;

    const pinLockedUntil = reachedLimit
      ? new Date(
          Date.now() + authConfig.lockMinutes * 60 * 1000,
        )
      : null;

    await registerFailedPinAttempt(
      employee.id,
      failedPinAttempts,
      pinLockedUntil,
    );

    throw new AuthError(
      reachedLimit ? "ACCOUNT_LOCKED" : "INVALID_CREDENTIALS",
      reachedLimit
        ? "Muitas tentativas incorretas. Aguarde antes de tentar novamente."
        : "Funcionário ou PIN inválido.",
      reachedLimit ? 429 : 401,
    );
  }

  await resetPinAttempts(employee.id);

  const sessionToken = createSessionToken();
  const tokenHash = hashSessionToken(sessionToken);
  const expiresAt = createSessionExpiration();

  await createManagementSession({
    employeeId: employee.id,
    tokenHash,
    expiresAt,
  });

  const canAccessManagement =
    employee.role.permissions.some(
      (rolePermission) =>
        rolePermission.permission.code === MANAGEMENT_PERMISSION,
    );

  const destination = employee.mustChangePin
    ? "/trocar-pin"
    : canAccessManagement
      ? "/gerencia"
      : "/producao";

  return {
    sessionToken,
    expiresAt,
    employee: {
      id: employee.id,
      name: employee.name,
      mustChangePin: employee.mustChangePin,
      canAccessManagement,
    },
    destination,
  };
}