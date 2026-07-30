import { DomainError } from "@/domain/errors";
import type { AccountId } from "@/domain/ids";
import type { Money } from "@/domain/money/money";
import type { UnitOfWork } from "@/domain/ports/unit-of-work";

export interface BalanceView {
  readonly accountId: AccountId;
  /** Suma zapisow w ksiedze — zrodlo prawdy. */
  readonly balance: Money;
  /** Saldo powiekszone o limit kredytowy, jesli konto go ma. */
  readonly available: Money;
}

/**
 * Saldo liczone z ksiegi przy kazdym odczycie.
 *
 * Widoki listujace konta czytaja `balance_cached_minor` i sa przez to szybsze;
 * ta funkcja istnieje po to, zeby bylo z czym porownac pamiec podreczna i zeby
 * kazda decyzja o pieniadzach miala dostep do wartosci, ktora nie moze sie
 * rozjechac z ksiega.
 */
export async function getBalance(
  deps: { readonly uow: UnitOfWork },
  accountId: AccountId,
): Promise<BalanceView> {
  return deps.uow.run(async (repos) => {
    const account = await repos.accounts.findById(accountId);

    if (account === null) {
      throw new DomainError(
        "ACCOUNT_NOT_FOUND",
        `Konto ${accountId} nie istnieje.`,
      );
    }

    const balance = await repos.ledger.balanceOf(accountId, account.currency);

    return {
      accountId,
      balance,
      available:
        account.creditLimit === null
          ? balance
          : {
              amountMinor: balance.amountMinor + account.creditLimit.amountMinor,
              currency: account.currency,
            },
    };
  });
}
