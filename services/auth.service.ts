import { compare, hash } from "bcryptjs";

import {
  findActiveEmployees,
  findEmployeeForAuthentication,
  registerFailedPinAttempt,
  resetPinAttempts,
  updateEmployeePin,
} from "@/repositories/employee.repository";
import {
  createManagementSession,
  findActiveSession,
  revokeSession,
} from "@/repositories/management-session.repository";
import { AuthError } from "@/types/auth.types";
import {
  authConfig,
  createSessionExpiration,
  createSessionToken,
  hashSessionToken,
} from "@/utils/auth";

import { getAccessProfile, hasPermission } from "@/utils/access";

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

  if (!employee?.pinHash || !employee.role.active) {
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

  const { canAccessManagement, destination } = getAccessProfile(employee);

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

export async function changeEmployeePin(
  sessionToken: string,
  newPin: string,
  confirmPin: string,
) {
  if (!sessionToken) {
    throw new AuthError(
      "INVALID_SESSION",
      "Sua sessão não é válida. Entre novamente.",
      401,
    );
  }

  if (!/^\d{4}$/.test(newPin)) {
    throw new AuthError(
      "INVALID_INPUT",
      "O novo PIN deve possuir exatamente quatro números.",
      400,
    );
  }

  if (newPin === "0000") {
    throw new AuthError(
      "INVALID_INPUT",
      "Escolha um PIN diferente do PIN provisório.",
      400,
    );
  }

  if (newPin !== confirmPin) {
    throw new AuthError(
      "INVALID_INPUT",
      "A confirmação do PIN está diferente.",
      400,
    );
  }

  const tokenHash = hashSessionToken(sessionToken);
  const session = await findActiveSession(tokenHash);

  if (!session || !session.employee.active || !session.employee.role.active) {
    throw new AuthError(
      "INVALID_SESSION",
      "Sua sessão expirou. Entre novamente.",
      401,
    );
  }

  if (
    session.employee.pinHash &&
    (await compare(newPin, session.employee.pinHash))
  ) {
    throw new AuthError(
      "INVALID_INPUT",
      "O novo PIN precisa ser diferente do PIN atual.",
      400,
    );
  }

  const newPinHash = await hash(newPin, 12);

  await updateEmployeePin(session.employee.id, newPinHash);

  const { canAccessManagement, destination } = getAccessProfile({
    ...session.employee,
    mustChangePin: false,
  });

  return {
    employee: {
      id: session.employee.id,
      name: session.employee.name,
      mustChangePin: false,
      canAccessManagement,
    },
    destination,
  };
}

export async function getAuthenticatedEmployee(sessionToken: string) {
  if (!sessionToken) return null;
  const session = await findActiveSession(hashSessionToken(sessionToken));
  if (!session || !session.employee.active || !session.employee.role.active) return null;
  const employee = session.employee;
  return {
    id: employee.id,
    name: employee.name,
    mustChangePin: employee.mustChangePin,
    ...getAccessProfile(employee),
    permissions: employee.role.permissions
      .filter((entry) => hasPermission(employee, entry.permission.code))
      .map((entry) => entry.permission.code),
  };
}

export async function requireAccess(sessionToken: string, permission?: string) {
  const employee = await getAuthenticatedEmployee(sessionToken);
  if (!employee) throw new AuthError("INVALID_SESSION", "Entre novamente para continuar.", 401);
  if (employee.mustChangePin) throw new AuthError("PIN_CHANGE_REQUIRED", "Altere seu PIN antes de continuar.", 403);
  if (permission && !employee.permissions.includes(permission)) {
    throw new AuthError("FORBIDDEN", "Você não tem permissão para acessar esta área.", 403);
  }
  return employee;
}

export async function logoutEmployee(sessionToken: string) {
  if (sessionToken) await revokeSession(hashSessionToken(sessionToken));
}
