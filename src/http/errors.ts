import { DomainError, type DomainErrorCode } from "@/domain/errors";
import { ValidationError } from "@/http/validation";

/**
 * Odwzorowanie kodow domenowych na statusy HTTP.
 *
 * Tabela jest kompletna z definicji: `Record<DomainErrorCode, number>` sprawia, ze
 * dodanie kodu domenowego bez decyzji o statusie nie kompiluje sie. Wersja z
 * `switch` i domyslnym przypadkiem przepuszczalaby nowy kod jako 500.
 */
const STATUS: Record<DomainErrorCode, number> = {
  // Walidacja wejscia
  CURRENCY_MISMATCH: 400,
  UNSUPPORTED_CURRENCY: 400,
  UNBALANCED_TRANSACTION: 400,
  EMPTY_TRANSACTION: 400,
  ACCOUNT_CURRENCY_MISMATCH: 400,
  NON_POSITIVE_AMOUNT: 400,
  SAME_ACCOUNT_TRANSFER: 400,
  INVALID_CUSTOMER_NUMBER: 400,
  WEAK_PASSWORD: 400,
  INVALID_PIN_FORMAT: 400,

  // Uwierzytelnienie i autoryzacja
  INVALID_CREDENTIALS: 401,
  SESSION_EXPIRED: 401,
  REFRESH_TOKEN_INVALID: 401,
  SESSION_THEFT_SUSPECTED: 401,
  ELEVATION_REQUIRED: 403,

  // Stan zasobu
  ACCOUNT_NOT_FOUND: 404,
  ACCOUNT_NOT_ACTIVE: 409,
  EMAIL_TAKEN: 409,
  IDEMPOTENCY_CONFLICT: 409,

  // 423 Locked — stan przejsciowy, ktory minie sam. Rozne od 403, ktore znaczy
  // "nie masz prawa", i od 401, ktore znaczy "nie wiem, kim jestes".
  ACCOUNT_LOCKED: 423,
  PIN_LOCKED: 423,
  PIN_NOT_SET: 409,

  INSUFFICIENT_FUNDS: 422,
  RATE_LIMITED: 429,
};

export function statusForDomainError(error: DomainError): number {
  return STATUS[error.code];
}

export interface ErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: unknown;
  };
}

export function toErrorBody(error: unknown): {
  readonly status: number;
  readonly body: ErrorBody;
} {
  if (error instanceof ValidationError) {
    return {
      status: 400,
      body: {
        error: {
          code: "VALIDATION_ERROR",
          message: error.message,
          details: error.issues,
        },
      },
    };
  }

  if (error instanceof DomainError) {
    return {
      status: statusForDomainError(error),
      body: { error: { code: error.code, message: error.message } },
    };
  }

  // Nieznany blad nie wychodzi na zewnatrz ze swoja trescia. Komunikaty wyjatkow
  // potrafia zawierac fragmenty zapytan SQL, sciezki i nazwy kolumn — to mapa
  // systemu wreczona osobie, ktora akurat go bada.
  return {
    status: 500,
    body: {
      error: {
        code: "INTERNAL_ERROR",
        message: "Cos poszlo nie tak po naszej stronie. Sprobuj ponownie.",
      },
    },
  };
}
