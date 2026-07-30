import { DomainError } from "@/domain/errors";
import type { AccountId, FxRateId, TransactionId, UserId } from "@/domain/ids";
import type { Currency } from "@/domain/money/currency";
import { type Money, isZero, sum } from "@/domain/money/money";

export const TRANSACTION_KINDS = [
  "internal_transfer",
  "external_transfer",
  "card_payment",
  "fx_exchange",
  "incoming",
  "fee",
  "interest",
] as const;
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

export const TRANSACTION_STATUSES = [
  "pending",
  "booked",
  "rejected",
  "reversed",
] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

/**
 * Pojedynczy zapis ksiegowy. Znak niesie kierunek: ujemny to obciazenie (debet),
 * dodatni to uznanie (kredyt). Dwie osobne kolumny na debet i kredyt byly by
 * czytelniejsze dla ksiegowego, ale kazda operacja arytmetyczna wymagalaby wtedy
 * rozgalezienia — a to miejsce, w ktorym rodza sie bledy znaku.
 */
export interface LedgerEntryDraft {
  readonly accountId: AccountId;
  readonly amount: Money;
}

export interface TransactionDraft {
  readonly idempotencyKey: string;
  readonly kind: TransactionKind;
  readonly title: string;
  readonly entries: readonly LedgerEntryDraft[];
  readonly initiatedBy: UserId | null;
  readonly fxRateId: FxRateId | null;
  readonly counterpartyName: string | null;
  readonly counterpartyIban: string | null;
  readonly category: string | null;
  readonly merchant: string | null;
}

export interface BookedTransaction {
  readonly id: TransactionId;
  readonly idempotencyKey: string;
  readonly kind: TransactionKind;
  readonly status: TransactionStatus;
  readonly title: string;
  readonly bookedAt: Date;
  readonly entries: readonly LedgerEntryDraft[];
}

/** Waluty wystepujace w zestawie zapisow, bez powtorzen. */
export function currenciesOf(
  entries: readonly LedgerEntryDraft[],
): readonly Currency[] {
  return [...new Set(entries.map((entry) => entry.amount.currency))];
}

/**
 * Niezmiennik ksiegi (zasada nienaruszalna nr 4): suma zapisow transakcji, liczona
 * osobno dla kazdej waluty, wynosi zero.
 *
 * "Osobno dla kazdej waluty" to sedno. Przewalutowanie ma niezerowa sume, jesli
 * zsumowac wszystko razem — 100 EUR i 430 PLN nie skracaja sie nawzajem. Bilansuje
 * sie dopiero per waluta, bo druga strona kazdej nogi lezy na koncie pozycji
 * walutowej banku.
 *
 * Ta sama regula jest wymuszona w bazie odroczonym wyzwalaczem sprawdzanym przy
 * COMMIT. Sprawdzenie tutaj nie jest jego dublem: daje czytelny blad domenowy
 * zanim cokolwiek dotknie dysku, a wyzwalacz lapie takze zapisy wstawione z
 * pominieciem tej sciezki.
 */
export function assertBalanced(entries: readonly LedgerEntryDraft[]): void {
  if (entries.length === 0) {
    throw new DomainError(
      "EMPTY_TRANSACTION",
      "Transakcja bez zapisow ksiegowych nie ma sensu.",
    );
  }

  for (const currency of currenciesOf(entries)) {
    const total = sum(
      entries
        .filter((entry) => entry.amount.currency === currency)
        .map((entry) => entry.amount),
      currency,
    );

    if (!isZero(total)) {
      throw new DomainError(
        "UNBALANCED_TRANSACTION",
        `Zapisy w walucie ${currency} sumuja sie do ${total.amountMinor}, a musza do zera.`,
      );
    }
  }
}

/** Zmiana salda konta wynikajaca z zestawu zapisow. */
export function netChangeFor(
  entries: readonly LedgerEntryDraft[],
  account: AccountId,
  currency: Currency,
): Money {
  return sum(
    entries
      .filter(
        (entry) =>
          entry.accountId === account && entry.amount.currency === currency,
      )
      .map((entry) => entry.amount),
    currency,
  );
}
