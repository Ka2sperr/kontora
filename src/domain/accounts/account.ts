import { DomainError } from "@/domain/errors";
import type { AccountId, UserId } from "@/domain/ids";
import type { Currency } from "@/domain/money/currency";
import { type Money, money } from "@/domain/money/money";

export const ACCOUNT_KINDS = [
  "checking",
  "savings",
  "credit",
  "internal",
] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export const ACCOUNT_STATUSES = ["active", "frozen", "closed"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/**
 * Kody kont wewnetrznych banku. Bez nich ksiega sie nie bilansuje: przelew
 * zewnetrzny musi miec druga strone, a marza na przewalutowaniu musi gdzies
 * osiasc. Klient ich nie widzi, ale kazdy zapis ma komplet stron.
 */
export const BANK_SETTLEMENT_PLN = "BANK_SETTLEMENT_PLN";
export const BANK_FEE_INCOME_PLN = "BANK_FEE_INCOME_PLN";
export const BANK_CREDIT_LINE_PLN = "BANK_CREDIT_LINE_PLN";

export function bankFxPositionCode(currency: Currency): string {
  return `BANK_FX_POSITION_${currency}`;
}

export interface Account {
  readonly id: AccountId;
  readonly userId: UserId | null;
  readonly internalCode: string | null;
  readonly currency: Currency;
  readonly kind: AccountKind;
  readonly status: AccountStatus;
  /**
   * Saldo policzone z ksiegi. Nazwa mowi wprost, skad pochodzi — kolumna
   * `balance_cached_minor` jest wylacznie pamiecia podreczna tej wartosci
   * (zasada nienaruszalna nr 2).
   */
  readonly balance: Money;
  /** Wylacznie dla kind === "credit". */
  readonly creditLimit: Money | null;
}

/**
 * Znacznik konta zablokowanego przez `SELECT ... FOR UPDATE` w biezacej
 * transakcji bazodanowej.
 *
 * Typ jest nieosiagalny poza repozytorium: zaden kod aplikacyjny nie potrafi
 * wytworzyc wartosci `LockedAccount`, moze ja tylko dostac. Dzieki temu funkcja
 * liczaca przelew, ktora przyjmuje wylacznie `LockedAccount`, nie da sie wywolac
 * na koncie odczytanym zwyklym `findById`. Zapomniana blokada przestaje byc
 * bledem widocznym dopiero pod obciazeniem i staje sie bledem kompilacji.
 */
declare const lockedBrand: unique symbol;

export type LockedAccount = Account & { readonly [lockedBrand]: true };

/**
 * Dostepne srodki: saldo powiekszone o limit kredytowy, jesli konto go ma.
 * Konta wewnetrzne banku nie maja limitu i celowo moga schodzic ponizej zera —
 * `BANK_FX_POSITION_EUR` z ujemnym saldem oznacza po prostu krotka pozycje
 * walutowa banku, a nie debet klienta.
 */
export function availableFunds(account: Account): Money {
  if (account.creditLimit === null) {
    return account.balance;
  }

  return money(
    account.balance.amountMinor + account.creditLimit.amountMinor,
    account.currency,
  );
}

export function isInternal(account: Account): boolean {
  return account.kind === "internal";
}

export function assertActive(account: Account): void {
  if (account.status !== "active") {
    throw new DomainError(
      "ACCOUNT_NOT_ACTIVE",
      `Konto ${account.id} ma status ${account.status} i nie moze uczestniczyc w ksiegowaniu.`,
    );
  }
}

/**
 * Sprawdza, czy konto uniesie obciazenie o podana kwote dodatnia.
 *
 * Konta wewnetrzne banku sa zwolnione: bank finansuje wlasne rozrachunki i
 * ograniczanie ich saldem oznaczaloby, ze pierwszy przelew zewnetrzny w historii
 * systemu zostaje odrzucony, bo konto rozrachunkowe ma zero.
 */
export function assertCanDebit(account: Account, amount: Money): void {
  if (amount.currency !== account.currency) {
    throw new DomainError(
      "ACCOUNT_CURRENCY_MISMATCH",
      `Konto ${account.id} prowadzone jest w ${account.currency}, a obciazenie jest w ${amount.currency}.`,
    );
  }

  if (amount.amountMinor <= 0n) {
    throw new DomainError(
      "NON_POSITIVE_AMOUNT",
      "Kwota obciazenia musi byc dodatnia.",
    );
  }

  if (isInternal(account)) {
    return;
  }

  const available = availableFunds(account);

  if (available.amountMinor < amount.amountMinor) {
    throw new DomainError(
      "INSUFFICIENT_FUNDS",
      "Brak wystarczajacych srodkow na koncie zrodlowym.",
    );
  }
}
