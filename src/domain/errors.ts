/**
 * Jedyny rejestr kodow bledow domenowych. Warstwa HTTP mapuje `code` na
 * odpowiedz `{ error: { code, message } }`, wiec dodanie kodu tutaj jest
 * swiadoma zmiana kontraktu API, nie efektem ubocznym.
 */
export type DomainErrorCode = "CURRENCY_MISMATCH" | "UNSUPPORTED_CURRENCY";

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}
