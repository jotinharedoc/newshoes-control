import { createHash, randomBytes } from "node:crypto";

export const AUTH_COOKIE_NAME = "newshoes_session";

function readPositiveInteger(
  environmentName: string,
  fallback: number,
) {
  const value = Number(process.env[environmentName]);

  if (!Number.isInteger(value) || value <= 0) {
    return fallback;
  }

  return value;
}

export const authConfig = {
  maxFailedAttempts: readPositiveInteger(
    "AUTH_MAX_FAILED_ATTEMPTS",
    5,
  ),
  lockMinutes: readPositiveInteger(
    "AUTH_LOCK_MINUTES",
    15,
  ),
  sessionHours: readPositiveInteger(
    "AUTH_SESSION_HOURS",
    10,
  ),
};

export function createSessionToken() {
  return randomBytes(32).toString("hex");
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createSessionExpiration() {
  const milliseconds = authConfig.sessionHours * 60 * 60 * 1000;

  return new Date(Date.now() + milliseconds);
}