import { sql } from "drizzle-orm";
import {
  bigint,
  char,
  check,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { accountKind, accountStatus } from "./enums";
import { users } from "./users";

export const accounts = pgTable(
  "accounts",
  {
    id: uuid().primaryKey().defaultRandom(),
    // NULL dla kont wewnetrznych banku — one nie naleza do zadnego klienta.
    userId: uuid().references(() => users.id, { onDelete: "restrict" }),
    internalCode: text().unique(),
    iban: char({ length: 28 }).unique(),
    currency: char({ length: 3 }).notNull(),
    kind: accountKind().notNull(),
    displayName: text().notNull(),
    // Pamiec podreczna salda. Zrodlem prawdy jest suma ledger_entries; ta kolumna
    // jest przeliczana w tej samej transakcji, w ktorej powstaja zapisy
    // (zasada nienaruszalna nr 2). Test integracyjny porownuje ja z ksiega.
    // Wartosc domyslna podana surowym SQL-em: drizzle-kit serializuje snapshot
    // schematu przez JSON.stringify, ktory na literale `0n` rzuca wyjatkiem.
    balanceCachedMinor: bigint({ mode: "bigint" })
      .notNull()
      .default(sql`0`),
    creditLimitMinor: bigint({ mode: "bigint" }),
    status: accountStatus().notNull().default("active"),
    openedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("accounts_user_idx").on(table.userId),
    // Klucz obcy z ledger_entries wskazuje na te pare, dzieki czemu baza sama
    // pilnuje, ze zapis w EUR nie trafi na konto prowadzone w PLN. Sprawdzenie
    // wyzwalaczem robiloby to samo, ale dawaloby sie odroczyc i wylaczyc.
    unique("accounts_id_currency_key").on(table.id, table.currency),
    check("accounts_currency_iso4217", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    // Konto wewnetrzne banku nie ma wlasciciela, konto klienta go wymaga.
    // Bez tego sprawdzenia "konto niczyje" bylo by tylko konwencja.
    check(
      "accounts_owner_matches_kind",
      sql`(${table.kind} = 'internal' and ${table.userId} is null and ${table.internalCode} is not null)
          or (${table.kind} <> 'internal' and ${table.userId} is not null and ${table.internalCode} is null)`,
    ),
    check(
      "accounts_credit_limit_only_for_credit",
      sql`(${table.kind} = 'credit' and ${table.creditLimitMinor} is not null and ${table.creditLimitMinor} >= 0)
          or (${table.kind} <> 'credit' and ${table.creditLimitMinor} is null)`,
    ),
  ],
);
