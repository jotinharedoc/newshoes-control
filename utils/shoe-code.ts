import { ProductionError } from "@/types/production-error.types";

export const SHOE_CODE_MAX_LENGTH = 64;
export const SHOE_CODE_ERROR = `Informe um código com 1 a ${SHOE_CODE_MAX_LENGTH} números.`;

export function isValidShoeCode(value: unknown): value is string {
  return typeof value === "string" && /^\d+$/.test(value.trim()) &&
    value.trim().length <= SHOE_CODE_MAX_LENGTH;
}

export function normalizeShoeCode(value: unknown): string {
  if (!isValidShoeCode(value)) {
    throw new ProductionError("INVALID_INPUT", SHOE_CODE_ERROR, 400);
  }

  return value.trim();
}
