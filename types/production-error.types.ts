export type ProductionErrorCode =
  | "INVALID_INPUT"
  | "PROCESS_UNAVAILABLE"
  | "PROCESS_NOT_AUTHORIZED"
  | "ACTIVE_PRODUCTION_EXISTS"
  | "PRODUCTION_NOT_FOUND"
  | "INVALID_PRODUCTION_STATE"
  | "SHOE_ALREADY_PROCESSED"
  | "PRODUCTION_CONFLICT";

export class ProductionError extends Error {
  constructor(
    public readonly code: ProductionErrorCode,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ProductionError";
  }
}

