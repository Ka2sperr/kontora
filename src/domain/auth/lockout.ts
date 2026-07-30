/**
 * Blokady po nieudanych probach.
 *
 * Dwa rozne mechanizmy dla dwoch roznych zagrozen:
 *
 * - **Haslo** ma duza przestrzen, wiec atak wymaga wielu prob. Blokada czasowa z
 *   rosnacym opoznieniem sprawia, ze atak przestaje byc oplacalny, a wlasciciel
 *   konta odzyskuje dostep sam, bez kontaktu z bankiem.
 * - **PIN** ma najwyzej milion kombinacji. Blokada czasowa tylko spowolnilaby
 *   atak, ktory i tak by sie powiodl. Dlatego po trzech probach PIN jest
 *   blokowany twardo i odblokowuje go wylacznie ponowne uwierzytelnienie haslem —
 *   czyli czynnikiem, ktorego atakujacy nie ma.
 */

export const PASSWORD_ATTEMPTS_BEFORE_LOCKOUT = 5;
export const PASSWORD_BASE_LOCKOUT_MS = 15 * 60 * 1000;
export const PASSWORD_MAX_LOCKOUT_MS = 24 * 60 * 60 * 1000;

export const PIN_ATTEMPTS_BEFORE_HARD_LOCK = 3;

/**
 * Do kiedy konto jest zablokowane po `failedAttempts` nieudanych probach hasla.
 * `null` oznacza brak blokady.
 *
 * Opoznienie podwaja sie z kazda proba ponad limit: 15 min, 30, 60, 120... az do
 * doby. Gorne ograniczenie istnieje, bo blokada rosnaca bez konca zamienia
 * pomylke wlasciciela konta w trwala utrate dostepu — czyli w atak odmowy uslugi
 * wykonany cudzymi rekami.
 */
export function passwordLockoutUntil(
  failedAttempts: number,
  now: Date,
): Date | null {
  if (failedAttempts < PASSWORD_ATTEMPTS_BEFORE_LOCKOUT) {
    return null;
  }

  const overLimit = failedAttempts - PASSWORD_ATTEMPTS_BEFORE_LOCKOUT;
  const duration = Math.min(
    PASSWORD_BASE_LOCKOUT_MS * 2 ** overLimit,
    PASSWORD_MAX_LOCKOUT_MS,
  );

  return new Date(now.getTime() + duration);
}

export function isLocked(lockedUntil: Date | null, now: Date): boolean {
  return lockedUntil !== null && lockedUntil.getTime() > now.getTime();
}

export function lockSecondsLeft(lockedUntil: Date | null, now: Date): number {
  if (!isLocked(lockedUntil, now) || lockedUntil === null) {
    return 0;
  }

  return Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000);
}

/**
 * Znacznik twardej blokady PIN-u. Data wybrana tak, zeby zaden zegar jej nie
 * przekroczyl, a jednoczesnie zeby przy podgladzie bazy bylo od razu widac, ze to
 * stan celowy, a nie efekt bledu w liczeniu czasu.
 */
export const PIN_HARD_LOCK_UNTIL = new Date("9999-12-31T23:59:59.000Z");

export function isPinHardLocked(pinLockedUntil: Date | null): boolean {
  return (
    pinLockedUntil !== null &&
    pinLockedUntil.getTime() >= PIN_HARD_LOCK_UNTIL.getTime()
  );
}

export function shouldHardLockPin(failedAttempts: number): boolean {
  return failedAttempts >= PIN_ATTEMPTS_BEFORE_HARD_LOCK;
}
