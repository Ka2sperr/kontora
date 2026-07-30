import { and, eq, sql } from "drizzle-orm";
import { type AccountId, type TransactionId, accountId } from "@/domain/ids";
import type { Currency } from "@/domain/money/currency";
import { assertCurrency } from "@/domain/money/currency";
import { type Money, money } from "@/domain/money/money";
import type { LedgerEntryDraft } from "@/domain/ledger/transaction";
import type { LedgerRepository } from "@/domain/ports/repositories";
import type { DbExecutor } from "@/infrastructure/db/executor";
import { ledgerEntries } from "@/infrastructure/db/schema";

export class DrizzleLedgerRepository implements LedgerRepository {
  constructor(private readonly db: DbExecutor) {}

  async append(
    transaction: TransactionId,
    entries: readonly LedgerEntryDraft[],
  ): Promise<void> {
    if (entries.length === 0) {
      return;
    }

    // Jeden INSERT dla calego zestawu. Wstawianie po jednym zapisie dawaloby ten
    // sam efekt koncowy, ale kazdy wiersz jechalby osobna podroza do bazy — przy
    // przewalutowaniu to piec podrozy zamiast jednej.
    await this.db.insert(ledgerEntries).values(
      entries.map((entry) => ({
        transactionId: transaction,
        accountId: entry.accountId,
        currency: entry.amount.currency,
        amountMinor: entry.amount.amountMinor,
      })),
    );
  }

  async balanceOf(account: AccountId, currency: Currency): Promise<Money> {
    const rows = await this.db
      .select({
        total: sql<bigint>`coalesce(sum(${ledgerEntries.amountMinor}), 0)::bigint`,
      })
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.accountId, account),
          eq(ledgerEntries.currency, currency),
        ),
      );

    return money(rows[0]?.total ?? 0n, currency);
  }

  async entriesOf(
    transaction: TransactionId,
  ): Promise<readonly LedgerEntryDraft[]> {
    const rows = await this.db
      .select({
        accountId: ledgerEntries.accountId,
        currency: ledgerEntries.currency,
        amountMinor: ledgerEntries.amountMinor,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.transactionId, transaction))
      .orderBy(ledgerEntries.id);

    return rows.map((row) => ({
      accountId: accountId(row.accountId),
      amount: money(row.amountMinor, assertCurrency(row.currency.trim())),
    }));
  }
}
