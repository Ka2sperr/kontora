import type {
  Account,
  AccountKind,
  AccountStatus,
  LockedAccount,
} from "@/domain/accounts/account";
import { type AccountId, accountId } from "@/domain/ids";
import type { Currency } from "@/domain/money/currency";
import { money } from "@/domain/money/money";

interface FakeAccountOptions {
  readonly id?: string;
  readonly currency?: Currency;
  readonly kind?: AccountKind;
  readonly status?: AccountStatus;
  readonly balanceMinor?: bigint;
  readonly creditLimitMinor?: bigint | null;
  readonly internalCode?: string | null;
}

/**
 * Konto zablokowane na potrzeby testow czystej domeny.
 *
 * Rzutowanie przez `unknown` jest tu jedynym sposobem na wytworzenie
 * `LockedAccount` poza repozytorium — i o to chodzi. Gdyby dalo sie to zrobic
 * krocej, znacznik blokady nie chronilby przed niczym w kodzie produkcyjnym.
 */
export function lockedAccount(
  options: FakeAccountOptions = {},
): LockedAccount {
  const currency = options.currency ?? "PLN";
  const kind = options.kind ?? "checking";

  const account: Account = {
    id: accountId(options.id ?? "11111111-1111-4111-8111-111111111111"),
    userId: null,
    internalCode: options.internalCode ?? null,
    currency,
    kind,
    status: options.status ?? "active",
    balance: money(options.balanceMinor ?? 0n, currency),
    creditLimit:
      options.creditLimitMinor === undefined || options.creditLimitMinor === null
        ? null
        : money(options.creditLimitMinor, currency),
  };

  return account as unknown as LockedAccount;
}

export function id(value: string): AccountId {
  return accountId(value);
}
