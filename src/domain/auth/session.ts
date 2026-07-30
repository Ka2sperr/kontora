import { DomainError } from "@/domain/errors";
import type { UserId } from "@/domain/ids";

/**
 * Poziomy sesji — sedno ADR-002.
 *
 * Zalogowanie numerem klienta i haslem daje poziom `authenticated`. PIN podnosi
 * go do `elevated` na piec minut. PIN nie jest trzecim czynnikiem logowania, bo
 * cztery do szesciu cyfr to najwyzej milion kombinacji; jako czynnik logowania
 * bylby najslabszym ogniwem, a jako potwierdzenie pojedynczej operacji na juz
 * uwierzytelnionej sesji ma sens (model PSD2 SCA).
 */

export const ELEVATION_DURATION_MS = 5 * 60 * 1000;
export const ACCESS_TOKEN_DURATION_MS = 15 * 60 * 1000;
export const REFRESH_TOKEN_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
export const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

export type SessionLevel = "authenticated" | "elevated";

export interface SessionClaims {
  readonly userId: UserId;
  /** Identyfikator rodziny tokenow odswiezajacych — jedno "urzadzenie". */
  readonly familyId: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  /**
   * Do kiedy sesja jest podniesiona. `null` znaczy "nigdy nie byla".
   *
   * Wartosc jest w tokenie, a nie w bazie, i to jest swiadomy wybor: podniesienie
   * zyje piec minut, wiec sprawdzenie musi byc tanie i dzialac bez odczytu.
   * Konsekwencja: podniesienia nie da sie cofnac przed czasem. Przy piecio-
   * minutowym oknie to akceptowalne — przy godzinie nie byloby.
   */
  readonly elevatedUntil: Date | null;
}

export function isExpired(claims: SessionClaims, now: Date): boolean {
  return claims.expiresAt.getTime() <= now.getTime();
}

export function levelOf(claims: SessionClaims, now: Date): SessionLevel {
  if (
    claims.elevatedUntil !== null &&
    claims.elevatedUntil.getTime() > now.getTime()
  ) {
    return "elevated";
  }

  return "authenticated";
}

/** Ile sekund zostalo do wygasniecia podniesienia. Zero, gdy juz wygaslo. */
export function elevationSecondsLeft(
  claims: SessionClaims,
  now: Date,
): number {
  if (claims.elevatedUntil === null) {
    return 0;
  }

  const left = claims.elevatedUntil.getTime() - now.getTime();

  return left <= 0 ? 0 : Math.ceil(left / 1000);
}

export function elevate(claims: SessionClaims, now: Date): SessionClaims {
  return {
    ...claims,
    elevatedUntil: new Date(now.getTime() + ELEVATION_DURATION_MS),
  };
}

export function assertActiveSession(
  claims: SessionClaims,
  now: Date,
): void {
  if (isExpired(claims, now)) {
    throw new DomainError(
      "SESSION_EXPIRED",
      "Sesja wygasla. Zaloguj sie ponownie.",
    );
  }
}

/**
 * Operacje wymagajace potwierdzenia PIN-em (sekcja 6.1). Lista jest w domenie, a
 * nie rozsypana po kontrolerach, zeby dalo sie ja przeczytac w jednym miejscu i
 * zeby dodanie operacji wymagalo swiadomej decyzji, po ktorej stronie granicy lezy.
 */
export const ELEVATED_OPERATIONS = [
  "transfer",
  "fx_exchange",
  "card_reveal",
  "card_limits",
  "card_freeze",
  "password_change",
] as const;

export type ElevatedOperation = (typeof ELEVATED_OPERATIONS)[number];

export function assertElevated(
  claims: SessionClaims,
  now: Date,
  operation: ElevatedOperation,
): void {
  assertActiveSession(claims, now);

  if (levelOf(claims, now) !== "elevated") {
    throw new DomainError(
      "ELEVATION_REQUIRED",
      `Operacja ${operation} wymaga potwierdzenia PIN-em.`,
    );
  }
}
