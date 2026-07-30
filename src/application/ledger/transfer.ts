import {
  type PostTransactionDeps,
  postTransaction,
} from "@/application/ledger/post-transaction";
import type { LockedAccount } from "@/domain/accounts/account";
import { DomainError } from "@/domain/errors";
import type { AccountId, UserId } from "@/domain/ids";
import type { Currency } from "@/domain/money/currency";
import type { Money } from "@/domain/money/money";
import { negate } from "@/domain/money/money";
import type {
  BookedTransaction,
  LedgerEntryDraft,
} from "@/domain/ledger/transaction";
import { assertBalanced } from "@/domain/ledger/transaction";
import {
  planExternalTransfer,
  planInternalTransfer,
} from "@/domain/ledger/transfer";
import type { Repositories } from "@/domain/ports/repositories";

export interface InternalTransferInput {
  readonly idempotencyKey: string;
  readonly fromAccountId: AccountId;
  readonly toAccountId: AccountId;
  readonly amount: Money;
  readonly title: string;
  readonly initiatedBy: UserId | null;
  readonly category?: string | null;
}

/**
 * Przelew miedzy kontami w tym samym banku.
 *
 * Cala rola tej funkcji to polaczyc trzy rzeczy: klucz idempotencji, blokade kont
 * i czysta funkcje domenowa liczaca zapisy. Nie ma tu ani jednej reguly
 * biznesowej — gdyby sie pojawila, znaczyloby to, ze jest w zlym miejscu.
 */
export function transferInternal(
  deps: PostTransactionDeps,
  input: InternalTransferInput,
): Promise<BookedTransaction> {
  return postTransaction(deps, {
    idempotencyKey: input.idempotencyKey,
    kind: "internal_transfer",
    title: input.title,
    initiatedBy: input.initiatedBy,
    category: input.category ?? null,
    planEntries: async (repos) => {
      const locked = await repos.accounts.lockByIds([
        input.fromAccountId,
        input.toAccountId,
      ]);

      const from = requireAccount(locked.get(input.fromAccountId), "zrodlowe");
      const to = requireAccount(locked.get(input.toAccountId), "docelowe");

      return planInternalTransfer({ from, to, amount: input.amount });
    },
  });
}

export interface ExternalTransferInput {
  readonly idempotencyKey: string;
  readonly fromAccountId: AccountId;
  readonly amount: Money;
  readonly title: string;
  readonly counterpartyName: string;
  readonly counterpartyIban: string;
  readonly initiatedBy: UserId | null;
}

/**
 * Przelew poza bank. Druga strona zapisu to konto rozrachunkowe w walucie
 * przelewu — pieniadze nie znikaja z ksiegi, tylko przechodza na pozycje, ktora
 * bank rozlicza z innymi bankami.
 */
export function transferExternal(
  deps: PostTransactionDeps,
  input: ExternalTransferInput,
): Promise<BookedTransaction> {
  return postTransaction(deps, {
    idempotencyKey: input.idempotencyKey,
    kind: "external_transfer",
    title: input.title,
    initiatedBy: input.initiatedBy,
    counterpartyName: input.counterpartyName,
    counterpartyIban: input.counterpartyIban,
    planEntries: async (repos) => {
      const settlementId = await settlementAccountId(
        repos,
        input.amount.currency,
      );

      // Jedno wywolanie na komplet kont. Dwa osobne — najpierw rozrachunkowe,
      // potem zrodlowe — blokowalyby w kolejnosci narzuconej przez kod, a nie po
      // rosnacym identyfikatorze, czyli dokladnie w sposob, przed ktorym chroni
      // zasada nienaruszalna nr 6.
      const locked = await repos.accounts.lockByIds([
        input.fromAccountId,
        settlementId,
      ]);

      const from = requireAccount(locked.get(input.fromAccountId), "zrodlowe");
      const settlement = requireAccount(locked.get(settlementId), "rozrachunkowe");

      return planExternalTransfer({ from, settlement, amount: input.amount });
    },
  });
}

export interface IncomingTransferInput {
  readonly idempotencyKey: string;
  readonly toAccountId: AccountId;
  readonly amount: Money;
  readonly title: string;
  readonly counterpartyName?: string | null;
  readonly category?: string | null;
}

/**
 * Przelew przychodzacy: pieniadze wchodza do banku z zewnatrz. Lustrzane odbicie
 * przelewu zewnetrznego — obciazane jest konto rozrachunkowe, uznawane konto
 * klienta.
 *
 * ```
 * PLN   BANK_SETTLEMENT_PLN:  -10000
 * PLN   Konto klienta:        +10000
 * ```
 */
export function receiveIncoming(
  deps: PostTransactionDeps,
  input: IncomingTransferInput,
): Promise<BookedTransaction> {
  return postTransaction(deps, {
    idempotencyKey: input.idempotencyKey,
    kind: "incoming",
    title: input.title,
    initiatedBy: null,
    counterpartyName: input.counterpartyName ?? null,
    category: input.category ?? null,
    planEntries: async (repos) => {
      const settlementId = await settlementAccountId(
        repos,
        input.amount.currency,
      );

      const locked = await repos.accounts.lockByIds([
        input.toAccountId,
        settlementId,
      ]);

      const to = requireAccount(locked.get(input.toAccountId), "docelowe");
      const settlement = requireAccount(locked.get(settlementId), "rozrachunkowe");

      if (to.currency !== input.amount.currency) {
        throw new DomainError(
          "ACCOUNT_CURRENCY_MISMATCH",
          `Konto docelowe jest w ${to.currency}, a wplata w ${input.amount.currency}.`,
        );
      }

      const entries: readonly LedgerEntryDraft[] = [
        { accountId: settlement.id, amount: negate(input.amount) },
        { accountId: to.id, amount: input.amount },
      ];

      assertBalanced(entries);

      return entries;
    },
  });
}

async function settlementAccountId(
  repos: Repositories,
  currency: Currency,
): Promise<AccountId> {
  const code = `BANK_SETTLEMENT_${currency}`;
  const account = await repos.accounts.findByInternalCode(code);

  if (account === null) {
    throw new DomainError(
      "ACCOUNT_NOT_FOUND",
      `Bank nie prowadzi konta rozrachunkowego ${code}, wiec nie obsluguje przelewow zewnetrznych w ${currency}.`,
    );
  }

  return account.id;
}

function requireAccount(
  account: LockedAccount | undefined,
  role: string,
): LockedAccount {
  if (account === undefined) {
    throw new DomainError(
      "ACCOUNT_NOT_FOUND",
      `Konto ${role} nie istnieje.`,
    );
  }

  return account;
}
