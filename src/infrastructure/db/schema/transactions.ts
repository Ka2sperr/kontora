import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  char,
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { accounts } from "./accounts";
import { transactionKind, transactionStatus } from "./enums";
import { fxRates } from "./fx-rates";
import { users } from "./users";

export const transactions = pgTable(
  "transactions",
  {
    id: uuid().primaryKey().defaultRandom(),
    // Ograniczenie UNIQUE jest calym mechanizmem idempotencji. Sekwencja
    // "sprawdz, czy klucz istnieje, potem wstaw" ma okno wyscigu miedzy jednym a
    // drugim; ograniczenie w bazie go nie ma (ADR-007, Etap 1).
    idempotencyKey: text().notNull().unique(),
    kind: transactionKind().notNull(),
    status: transactionStatus().notNull().default("booked"),
    initiatedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    // Snapshot uzytego kursu — bez niego historyczne przewalutowanie przestaje
    // byc odtwarzalne w dniu, w ktorym NBP opublikuje nowa tabele.
    fxRateId: uuid().references(() => fxRates.id, { onDelete: "restrict" }),
    title: text().notNull(),
    counterpartyName: text(),
    counterpartyIban: char({ length: 28 }),
    category: text(),
    merchant: text(),
    bookedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("transactions_booked_at_idx").on(table.bookedAt.desc()),
    index("transactions_initiated_by_idx").on(table.initiatedBy),
  ],
);

/**
 * Ksiega. Tabela wylacznie do dopisywania — UPDATE, DELETE i TRUNCATE sa
 * blokowane wyzwalaczem zalozonym w migracji `0001_ledger_guards`.
 *
 * Znak niesie kierunek: ujemny to obciazenie, dodatni uznanie. Suma zapisow
 * jednej transakcji, liczona osobno per waluta, musi wynosic zero — pilnuje tego
 * odroczony wyzwalacz sprawdzany dopiero przy COMMIT, bo w trakcie wstawiania
 * kolejnych zapisow transakcja z definicji jest chwilowo niezbilansowana.
 */
export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: bigserial({ mode: "bigint" }).primaryKey(),
    transactionId: uuid()
      .notNull()
      .references(() => transactions.id, { onDelete: "restrict" }),
    accountId: uuid().notNull(),
    currency: char({ length: 3 }).notNull(),
    amountMinor: bigint({ mode: "bigint" }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Zlozony klucz obcy na (konto, waluta). Baza sama odrzuca zapis w EUR na
    // koncie prowadzonym w PLN — taki zapis zbilansowalby sie w swojej walucie i
    // przeszedl przez sprawdzenie sumy, a mimo to bylby bez sensu.
    foreignKey({
      name: "ledger_entries_account_currency_fk",
      columns: [table.accountId, table.currency],
      foreignColumns: [accounts.id, accounts.currency],
    }).onDelete("restrict"),
    index("ledger_entries_transaction_idx").on(table.transactionId),
    // Historia konta i liczenie salda: oba zapytania czytaja po koncie, historia
    // dodatkowo od najnowszych.
    index("ledger_entries_account_idx").on(table.accountId, table.id.desc()),
    // Zapis na zero nie zmienia salda, a zasmieca historie i psuje liczenie
    // "ile bylo operacji".
    check("ledger_entries_amount_not_zero", sql`${table.amountMinor} <> 0`),
  ],
);
