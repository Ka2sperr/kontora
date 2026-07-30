import { DomainError } from "@/domain/errors";

/**
 * Polityka hasel.
 *
 * Jedno wymaganie dlugosci i sprawdzenie w bazie wyciekow — bez wymogow na wielkie
 * litery, cyfry i znaki specjalne. To nie jest lenistwo, tylko zgodnosc z NIST
 * SP 800-63B: wymogi kompozycji przewidywalnie produkuja `Haslo123!`, czyli haslo
 * slabe i trudne do zapamietania naraz. Dlugosc plus odrzucenie hasel znanych z
 * wyciekow daje wiecej i mniej boli.
 */

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 256;

export type PasswordRejection =
  | { readonly reason: "too_short"; readonly minLength: number }
  | { readonly reason: "too_long"; readonly maxLength: number }
  | { readonly reason: "whitespace_only" }
  | { readonly reason: "breached"; readonly occurrences: number };

export function checkPasswordShape(password: string): PasswordRejection | null {
  // Dlugosc liczona w punktach kodowych, nie w jednostkach UTF-16. Haslo zlozone
  // z dwunastu emoji ma `length` rowne 24 i przeszloby sprawdzenie majace zupelnie
  // inny sens.
  const length = [...password].length;

  if (length < MIN_PASSWORD_LENGTH) {
    return { reason: "too_short", minLength: MIN_PASSWORD_LENGTH };
  }

  // Gorny limit istnieje dla ochrony przed zadaniem, ktore zajmuje procesor na
  // hashowaniu megabajta danych, a nie dla bezpieczenstwa hasla.
  if (length > MAX_PASSWORD_LENGTH) {
    return { reason: "too_long", maxLength: MAX_PASSWORD_LENGTH };
  }

  if (password.trim().length === 0) {
    return { reason: "whitespace_only" };
  }

  return null;
}

export function describeRejection(rejection: PasswordRejection): string {
  switch (rejection.reason) {
    case "too_short":
      return `Haslo musi miec co najmniej ${rejection.minLength} znakow.`;
    case "too_long":
      return `Haslo moze miec najwyzej ${rejection.maxLength} znakow.`;
    case "whitespace_only":
      return "Haslo nie moze skladac sie z samych spacji.";
    case "breached":
      return `To haslo wystapilo w znanych wyciekach danych ${rejection.occurrences} razy. Wybierz inne — nie dlatego, ze jest slabe, tylko dlatego, ze jest juz na listach uzywanych do atakow.`;
  }
}

export function assertPasswordShape(password: string): void {
  const rejection = checkPasswordShape(password);

  if (rejection !== null) {
    throw new DomainError("WEAK_PASSWORD", describeRejection(rejection));
  }
}

export const PIN_LENGTH_MIN = 4;
export const PIN_LENGTH_MAX = 6;

export function assertPinShape(pin: string): void {
  if (!/^\d+$/.test(pin)) {
    throw new DomainError("INVALID_PIN_FORMAT", "PIN sklada sie z samych cyfr.");
  }

  if (pin.length < PIN_LENGTH_MIN || pin.length > PIN_LENGTH_MAX) {
    throw new DomainError(
      "INVALID_PIN_FORMAT",
      `PIN ma od ${PIN_LENGTH_MIN} do ${PIN_LENGTH_MAX} cyfr.`,
    );
  }
}
