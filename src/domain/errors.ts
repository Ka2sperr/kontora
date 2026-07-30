/**
 * Jedyny rejestr kodow bledow domenowych. Warstwa HTTP mapuje `code` na
 * odpowiedz `{ error: { code, message } }`, wiec dodanie kodu tutaj jest
 * swiadoma zmiana kontraktu API, nie efektem ubocznym.
 */
export type DomainErrorCode =
  // Kwoty i waluty
  | "CURRENCY_MISMATCH"
  | "UNSUPPORTED_CURRENCY"
  // Ksiega
  | "UNBALANCED_TRANSACTION"
  | "EMPTY_TRANSACTION"
  | "ACCOUNT_NOT_FOUND"
  | "ACCOUNT_NOT_ACTIVE"
  | "ACCOUNT_CURRENCY_MISMATCH"
  | "INSUFFICIENT_FUNDS"
  | "SAME_ACCOUNT_TRANSFER"
  | "NON_POSITIVE_AMOUNT"
  // Idempotencja
  | "IDEMPOTENCY_CONFLICT"
  // Uwierzytelnianie
  | "INVALID_CUSTOMER_NUMBER"
  | "WEAK_PASSWORD"
  | "INVALID_PIN_FORMAT"
  | "INVALID_CREDENTIALS"
  | "ACCOUNT_LOCKED"
  | "PIN_LOCKED"
  | "PIN_NOT_SET"
  | "SESSION_EXPIRED"
  | "ELEVATION_REQUIRED"
  | "REFRESH_TOKEN_INVALID"
  | "SESSION_THEFT_SUSPECTED"
  | "RATE_LIMITED"
  | "EMAIL_TAKEN";

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}

export function isDomainError(
  error: unknown,
  code?: DomainErrorCode,
): error is DomainError {
  if (!(error instanceof DomainError)) {
    return false;
  }

  return code === undefined || error.code === code;
}
