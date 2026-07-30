import { eq } from "drizzle-orm";
import { DomainError } from "@/domain/errors";
import {
  type TransactionId,
  accountId,
  transactionId,
} from "@/domain/ids";
import { assertCurrency } from "@/domain/money/currency";
import { money } from "@/domain/money/money";
import type {
  BookedTransaction,
  LedgerEntryDraft,
  TransactionDraft,
} from "@/domain/ledger/transaction";
import type { TransactionRepository } from "@/domain/ports/repositories";
import type { DbExecutor } from "@/infrastructure/db/executor";
import { isUniqueViolation } from "@/infrastructure/db/postgres-errors";
import { ledgerEntries, transactions } from "@/infrastructure/db/schema";

/** Nazwa ograniczenia z migracji 0000. Zmiana tam wymaga zmiany tutaj. */
const IDEMPOTENCY_KEY_CONSTRAINT = "transactions_idempotencyKey_unique";

export class DrizzleTransactionRepository implements TransactionRepository {
  constructor(private readonly db: DbExecutor) {}

  async insert(
    draft: TransactionDraft,
    bookedAt: Date,
  ): Promise<TransactionId> {
    try {
      const rows = await this.db
        .insert(transactions)
        .values({
          idempotencyKey: draft.idempotencyKey,
          kind: draft.kind,
          status: "booked",
          initiatedBy: draft.initiatedBy,
          fxRateId: draft.fxRateId,
          title: draft.title,
          counterpartyName: draft.counterpartyName,
          counterpartyIban: draft.counterpartyIban,
          category: draft.category,
          merchant: draft.merchant,
          bookedAt,
        })
        .returning({ id: transactions.id });

      const row = rows[0];

      if (row === undefined) {
        throw new Error("INSERT nie zwrocil identyfikatora transakcji.");
      }

      return transactionId(row.id);
    } catch (error) {
      // Naruszenie UNIQUE na kluczu idempotencji nie jest awaria — jest
      // odpowiedzia. Ktos wyslal to samo zadanie drugi raz, a warstwa
      // aplikacyjna wie, co z tym zrobic (zwrocic oryginalny wynik).
      if (isUniqueViolation(error, IDEMPOTENCY_KEY_CONSTRAINT)) {
        throw new DomainError(
          "IDEMPOTENCY_CONFLICT",
          `Klucz idempotencji ${draft.idempotencyKey} zostal juz uzyty.`,
        );
      }

      throw error;
    }
  }

  async findByIdempotencyKey(key: string): Promise<BookedTransaction | null> {
    const rows = await this.db
      .select()
      .from(transactions)
      .where(eq(transactions.idempotencyKey, key))
      .limit(1);

    const row = rows[0];

    return row === undefined ? null : this.withEntries(row);
  }

  async findById(id: TransactionId): Promise<BookedTransaction | null> {
    const rows = await this.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, id))
      .limit(1);

    const row = rows[0];

    return row === undefined ? null : this.withEntries(row);
  }

  private async withEntries(row: {
    id: string;
    idempotencyKey: string;
    kind: BookedTransaction["kind"];
    status: BookedTransaction["status"];
    title: string;
    bookedAt: Date;
  }): Promise<BookedTransaction> {
    const entryRows = await this.db
      .select({
        accountId: ledgerEntries.accountId,
        currency: ledgerEntries.currency,
        amountMinor: ledgerEntries.amountMinor,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.transactionId, row.id))
      .orderBy(ledgerEntries.id);

    const entries: readonly LedgerEntryDraft[] = entryRows.map((entry) => ({
      accountId: accountId(entry.accountId),
      amount: money(entry.amountMinor, assertCurrency(entry.currency.trim())),
    }));

    return {
      id: transactionId(row.id),
      idempotencyKey: row.idempotencyKey,
      kind: row.kind,
      status: row.status,
      title: row.title,
      bookedAt: row.bookedAt,
      entries,
    };
  }
}
