import { DomainError, isDomainError } from "@/domain/errors";
import type { AccountId, FxRateId, UserId } from "@/domain/ids";
import {
  type BookedTransaction,
  type LedgerEntryDraft,
  type TransactionKind,
  assertBalanced,
} from "@/domain/ledger/transaction";
import type { Clock } from "@/domain/ports/clock";
import type { Repositories } from "@/domain/ports/repositories";
import type { UnitOfWork } from "@/domain/ports/unit-of-work";

export interface PostTransactionDeps {
  readonly uow: UnitOfWork;
  readonly clock: Clock;
}

export interface PostTransactionInput {
  readonly idempotencyKey: string;
  readonly kind: TransactionKind;
  readonly title: string;
  readonly initiatedBy?: UserId | null;
  readonly fxRateId?: FxRateId | null;
  readonly counterpartyName?: string | null;
  readonly counterpartyIban?: string | null;
  readonly category?: string | null;
  readonly merchant?: string | null;
  /**
   * Ulozenie zapisow. Dostaje repozytoria zwiazane z otwarta juz transakcja
   * bazodanowa, wiec to tutaj — i tylko tutaj — wolno blokowac konta.
   */
  readonly planEntries: (
    repos: Repositories,
  ) => Promise<readonly LedgerEntryDraft[]>;
}

/**
 * Jedyna droga, ktora zapisy trafiaja do ksiegi.
 *
 * Kolejnosc krokow nie jest przypadkowa:
 *
 * 1. Sprawdzenie klucza idempotencji poza transakcja — powtorka najczestszego
 *    przypadku (klient ponowil zadanie po timeoucie) konczy sie jednym odczytem,
 *    bez otwierania transakcji i bez blokowania czegokolwiek.
 * 2. Naglowek transakcji przed zapisami. Wymusza to klucz obcy, ale daje tez
 *    efekt uboczny, ktory jest tu najwazniejszy: ograniczenie UNIQUE na kluczu
 *    idempotencji strzela natychmiast, zanim ktokolwiek zdazy zablokowac konta.
 * 3. Blokada kont i ulozenie zapisow.
 * 4. Przeliczenie salda podrecznego w tej samej transakcji (zasada nr 2).
 *
 * Nieudana proba wycofuje sie w calosci, wiec klucz idempotencji wraca do
 * puli — ponowienie odrzuconego przelewu z tym samym kluczem jest liczone od nowa,
 * a nie odbija sie od zapisanego bledu (ADR-007).
 */
export async function postTransaction(
  deps: PostTransactionDeps,
  input: PostTransactionInput,
): Promise<BookedTransaction> {
  const alreadyBooked = await findByKey(deps, input.idempotencyKey);

  if (alreadyBooked !== null) {
    return alreadyBooked;
  }

  try {
    return await deps.uow.run(async (repos) => {
      const bookedAt = deps.clock.now();

      const transactionId = await repos.transactions.insert(
        {
          idempotencyKey: input.idempotencyKey,
          kind: input.kind,
          title: input.title,
          entries: [],
          initiatedBy: input.initiatedBy ?? null,
          fxRateId: input.fxRateId ?? null,
          counterpartyName: input.counterpartyName ?? null,
          counterpartyIban: input.counterpartyIban ?? null,
          category: input.category ?? null,
          merchant: input.merchant ?? null,
        },
        bookedAt,
      );

      const entries = await input.planEntries(repos);

      assertBalanced(entries);

      await repos.ledger.append(transactionId, entries);
      await repos.accounts.refreshCachedBalances(accountsTouchedBy(entries));

      return {
        id: transactionId,
        idempotencyKey: input.idempotencyKey,
        kind: input.kind,
        status: "booked",
        title: input.title,
        bookedAt,
        entries,
      } satisfies BookedTransaction;
    });
  } catch (error) {
    if (!isDomainError(error, "IDEMPOTENCY_CONFLICT")) {
      throw error;
    }

    // Ktos wygral wyscig o ten sam klucz. Jego transakcja jest juz zatwierdzona
    // (inaczej ograniczenie UNIQUE kazaloby nam czekac, a nie odrzucaloby), wiec
    // odczyt zwroci komplet danych.
    const winner = await findByKey(deps, input.idempotencyKey);

    if (winner === null) {
      throw new DomainError(
        "IDEMPOTENCY_CONFLICT",
        `Klucz ${input.idempotencyKey} jest zajety, ale transakcji nie da sie odczytac.`,
      );
    }

    return winner;
  }
}

function findByKey(
  deps: PostTransactionDeps,
  key: string,
): Promise<BookedTransaction | null> {
  return deps.uow.run((repos) => repos.transactions.findByIdempotencyKey(key));
}

function accountsTouchedBy(
  entries: readonly LedgerEntryDraft[],
): readonly AccountId[] {
  return [...new Set(entries.map((entry) => entry.accountId))];
}
