import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { receiveIncoming } from "@/application/ledger/transfer";
import type { AccountKind } from "@/domain/accounts/account";
import { type AccountId, type UserId, accountId, userId } from "@/domain/ids";
import type { Currency } from "@/domain/money/currency";
import { type Money, money } from "@/domain/money/money";
import { sha256Hasher } from "@/infrastructure/crypto/sha256-hasher";
import { db } from "@/infrastructure/db/client";
import { accounts, users } from "@/infrastructure/db/schema";
import { DrizzleUnitOfWork } from "@/infrastructure/db/unit-of-work";
import { systemClock } from "@/infrastructure/time/system-clock";

/**
 * Wspolne zaplecze testow integracyjnych.
 *
 * Testy nie czyszcza bazy miedzy przebiegami i nie moglyby: ksiega jest tylko do
 * dopisywania, a wyzwalacz nie robi wyjatku dla testow. Zamiast tego kazdy test
 * tworzy wlasnego uzytkownika i wlasne konta, wiec przebiegi sa od siebie
 * niezalezne mimo wspolnej bazy. Efekt uboczny: sam sposob pisania testow
 * potwierdza, ze zakaz kasowania z ksiegi dziala.
 */

export const uow = new DrizzleUnitOfWork(db);
export const deps = { uow, clock: systemClock };
export const auditDeps = { uow, hasher: sha256Hasher };

let counter = 0;

function uniqueSuffix(): string {
  counter += 1;

  return `${Date.now() % 1_000_000}${counter}`.slice(-7).padStart(7, "0");
}

export async function createUser(): Promise<UserId> {
  const suffix = uniqueSuffix();

  const rows = await db
    .insert(users)
    .values({
      customerNumber: `${suffix}0`,
      passwordHash: "argon2id$test",
      firstName: "Test",
      lastName: "Testowy",
      email: `test-${randomUUID()}@example.invalid`,
    })
    .returning({ id: users.id });

  const row = rows[0];

  if (row === undefined) {
    throw new Error("Nie udalo sie utworzyc uzytkownika testowego.");
  }

  return userId(row.id);
}

interface CreateAccountOptions {
  readonly owner: UserId;
  readonly currency?: Currency;
  readonly kind?: AccountKind;
  readonly creditLimitMinor?: bigint;
}

export async function createAccount(
  options: CreateAccountOptions,
): Promise<AccountId> {
  const kind = options.kind ?? "checking";
  const currency = options.currency ?? "PLN";

  const rows = await db
    .insert(accounts)
    .values({
      userId: options.owner,
      currency,
      kind,
      displayName: `Konto testowe ${currency}`,
      creditLimitMinor:
        kind === "credit" ? (options.creditLimitMinor ?? 0n) : null,
    })
    .returning({ id: accounts.id });

  const row = rows[0];

  if (row === undefined) {
    throw new Error("Nie udalo sie utworzyc konta testowego.");
  }

  return accountId(row.id);
}

/** Zasila konto przelewem przychodzacym — jedyna droga, ktora pieniadze wchodza do banku. */
export async function fund(account: AccountId, amount: Money): Promise<void> {
  await receiveIncoming(deps, {
    idempotencyKey: `test-fund-${randomUUID()}`,
    toAccountId: account,
    amount,
    title: "Zasilenie konta testowego",
  });
}

export function pln(amountMinor: bigint): Money {
  return money(amountMinor, "PLN");
}

/** Saldo prosto z ksiegi, z pominieciem warstwy aplikacji. */
export async function ledgerBalance(account: AccountId): Promise<bigint> {
  const rows = await db.execute<{ total: bigint }>(
    sql`select coalesce(sum(amount_minor), 0)::bigint as total
        from ledger_entries where account_id = ${account}`,
  );

  return rows[0]?.total ?? 0n;
}

export async function cachedBalance(account: AccountId): Promise<bigint> {
  const rows = await db.execute<{ cached: bigint }>(
    sql`select balance_cached_minor as cached from accounts where id = ${account}`,
  );

  return rows[0]?.cached ?? 0n;
}

export async function countEntries(account: AccountId): Promise<number> {
  const rows = await db.execute<{ count: bigint }>(
    sql`select count(*)::bigint as count from ledger_entries where account_id = ${account}`,
  );

  return Number(rows[0]?.count ?? 0n);
}
