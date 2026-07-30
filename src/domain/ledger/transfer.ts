import {
  type LockedAccount,
  assertActive,
  assertCanDebit,
} from "@/domain/accounts/account";
import { DomainError } from "@/domain/errors";
import { type Money, negate } from "@/domain/money/money";
import {
  type LedgerEntryDraft,
  assertBalanced,
} from "@/domain/ledger/transaction";

/**
 * Ulozenie zapisow przelewu. Funkcje sa czyste: dostaja stan kont i kwote,
 * zwracaja zapisy. Nie wiedza o bazie, o HTTP ani o tym, ze cokolwiek zostanie
 * zapisane — dzieki temu testuje sie je bez Dockera i bez atrap.
 *
 * Przyjmuja wylacznie `LockedAccount`, wiec proba policzenia przelewu na koncie
 * odczytanym bez blokady wiersza nie przechodzi kompilacji.
 */

interface InternalTransferInput {
  readonly from: LockedAccount;
  readonly to: LockedAccount;
  readonly amount: Money;
}

/**
 * Przelew wewnetrzny: dwa zapisy, jedna waluta, suma zero.
 *
 * ```
 * PLN   A: -10000
 * PLN   B: +10000
 * ```
 */
export function planInternalTransfer(
  input: InternalTransferInput,
): readonly LedgerEntryDraft[] {
  const { from, to, amount } = input;

  if (from.id === to.id) {
    throw new DomainError(
      "SAME_ACCOUNT_TRANSFER",
      "Konto zrodlowe i docelowe musza byc rozne.",
    );
  }

  if (from.currency !== to.currency) {
    throw new DomainError(
      "CURRENCY_MISMATCH",
      `Przelew wewnetrzny nie przewalutowuje: ${from.currency} na ${to.currency} wymaga wymiany walut.`,
    );
  }

  assertActive(from);
  assertActive(to);
  assertCanDebit(from, amount);

  const entries: readonly LedgerEntryDraft[] = [
    { accountId: from.id, amount: negate(amount) },
    { accountId: to.id, amount },
  ];

  assertBalanced(entries);

  return entries;
}

interface ExternalTransferInput {
  readonly from: LockedAccount;
  /** Konto rozrachunkowe banku w walucie przelewu (`BANK_SETTLEMENT_<CCY>`). */
  readonly settlement: LockedAccount;
  readonly amount: Money;
}

/**
 * Przelew zewnetrzny: pieniadze opuszczaja bank, wiec druga strona zapisu lezy na
 * koncie rozrachunkowym. Bez tego konta ksiega mialaby dziure dokladnie w miejscu,
 * w ktorym pieniadze wychodza na zewnatrz.
 *
 * ```
 * PLN   A:                    -10000
 * PLN   BANK_SETTLEMENT_PLN:  +10000
 * ```
 */
export function planExternalTransfer(
  input: ExternalTransferInput,
): readonly LedgerEntryDraft[] {
  const { from, settlement, amount } = input;

  if (settlement.kind !== "internal") {
    throw new DomainError(
      "ACCOUNT_NOT_FOUND",
      "Druga strona przelewu zewnetrznego musi byc kontem wewnetrznym banku.",
    );
  }

  if (from.currency !== settlement.currency) {
    throw new DomainError(
      "CURRENCY_MISMATCH",
      `Konto rozrachunkowe jest w ${settlement.currency}, a przelew w ${from.currency}.`,
    );
  }

  assertActive(from);
  assertCanDebit(from, amount);

  const entries: readonly LedgerEntryDraft[] = [
    { accountId: from.id, amount: negate(amount) },
    { accountId: settlement.id, amount },
  ];

  assertBalanced(entries);

  return entries;
}
