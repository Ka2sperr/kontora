/**
 * Tlumaczenie bledow Postgresa na jezyk domeny.
 *
 * Kody SQLSTATE sa stabilna czescia kontraktu bazy — inaczej niz tresc
 * komunikatu, ktora zmienia sie miedzy wersjami i zaleznie od locale serwera.
 * Dopasowywanie po tekscie dzialaloby do pierwszej aktualizacji Postgresa.
 */
export const SQLSTATE = {
  uniqueViolation: "23505",
  restrictViolation: "23001",
  integrityConstraintViolation: "23000",
  checkViolation: "23514",
  foreignKeyViolation: "23503",
  raiseException: "P0001",
} as const;

interface PostgresError {
  readonly code: string;
  readonly constraint_name?: string;
  readonly message?: string;
}

/**
 * Blad sterownika przychodzi opakowany.
 *
 * Drizzle zawija wyjatek postgres.js we wlasny `DrizzleQueryError`, zeby dolaczyc
 * tresc zapytania i parametry. Wygodne przy diagnozie, ale sprawia, ze `error.code`
 * na wierzchu jest puste — sprawdzenie SQLSTATE na najwyzszej warstwie zawsze
 * zwracaloby falsz, a naruszenie klucza idempotencji przeciekaloby do klienta jako
 * blad 500 zamiast poprawnej odpowiedzi na powtorzone zadanie.
 *
 * Dlatego schodzimy po lancuchu `cause` az do warstwy, ktora zna SQLSTATE.
 */
function asPostgresError(error: unknown): PostgresError | null {
  let current: unknown = error;

  // Ograniczenie glebokosci: lancuch `cause` moze byc cykliczny, jesli ktos
  // ustawil go recznie.
  for (let depth = 0; depth < 8 && current !== null && current !== undefined; depth += 1) {
    if (typeof current === "object" && "code" in current) {
      const code = (current as { code: unknown }).code;

      if (typeof code === "string") {
        return current as unknown as PostgresError;
      }
    }

    current =
      typeof current === "object" && "cause" in current
        ? (current as { cause: unknown }).cause
        : null;
  }

  return null;
}

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const pgError = asPostgresError(error);

  if (pgError?.code !== SQLSTATE.uniqueViolation) {
    return false;
  }

  return constraint === undefined || pgError.constraint_name === constraint;
}

export function postgresErrorCode(error: unknown): string | null {
  return asPostgresError(error)?.code ?? null;
}

/**
 * Pelny komunikat wraz z przyczynami. Uzywany w testach, ktore sprawdzaja, ze
 * odezwal sie konkretny wyzwalacz — jego tekst jest schowany dwie warstwy glebiej.
 */
export function fullErrorMessage(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;

  for (let depth = 0; depth < 8 && current !== null && current !== undefined; depth += 1) {
    if (current instanceof Error) {
      parts.push(current.message);
      current = current.cause;

      continue;
    }

    parts.push(String(current));
    break;
  }

  return parts.join(" | ");
}
