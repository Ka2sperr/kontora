import { sql } from "drizzle-orm";
import {
  bigint,
  char,
  check,
  date,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Kursy NBP. Tabela A to kurs sredni, tabela C kupno/sprzedaz.
 *
 * Kursy trzymane sa jako liczby calkowite pomnozone przez 100 000 (piec miejsc
 * po przecinku), z tego samego powodu, dla ktorego kwoty sa w jednostkach minor:
 * kurs 4,2355 zapisany jako `float` przestaje byc dokladnie 4,2355, a odtworzenie
 * historycznego przewalutowania przestaje dawac ten sam wynik.
 */
export const FX_RATE_SCALE = 100_000n;

export const fxRates = pgTable(
  "fx_rates",
  {
    id: uuid().primaryKey().defaultRandom(),
    tableType: char({ length: 1 }).notNull(),
    tableNo: text().notNull(),
    currency: char({ length: 3 }).notNull(),
    midMinor: bigint({ mode: "bigint" }),
    bidMinor: bigint({ mode: "bigint" }),
    askMinor: bigint({ mode: "bigint" }),
    effectiveDate: date().notNull(),
    fetchedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("fx_rates_type_currency_date_key").on(
      table.tableType,
      table.currency,
      table.effectiveDate,
    ),
    // Fallback weekendowy pyta o najswiezszy kurs nie pozniejszy niz dana data —
    // ten indeks zamienia to zapytanie w odczyt jednego wiersza.
    index("fx_rates_lookup_idx").on(
      table.currency,
      table.tableType,
      table.effectiveDate.desc(),
    ),
    check("fx_rates_table_type", sql`${table.tableType} in ('A', 'C')`),
    check(
      "fx_rates_shape_matches_table",
      sql`(${table.tableType} = 'A' and ${table.midMinor} is not null)
          or (${table.tableType} = 'C' and ${table.bidMinor} is not null and ${table.askMinor} is not null)`,
    ),
  ],
);
