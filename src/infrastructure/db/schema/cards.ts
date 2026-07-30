import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  check,
  customType,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { accounts } from "./accounts";
import {
  cardKind,
  cardLimitChannel,
  cardLimitPeriod,
  cardStatus,
} from "./enums";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/**
 * Karty. PAN i CVV przechowywane wylacznie zaszyfrowane (AES-256-GCM, klucz ze
 * srodowiska). W tabeli nie ma i nie bedzie kolumny z jawnym numerem — cztery
 * ostatnie cyfry i BIN wystarczaja do wszystkiego poza jednym endpointem reveal,
 * ktory deszyfruje w locie i zapisuje ten fakt w logu audytu.
 *
 * BIN zaczyna sie od cyfry 9, ktora nie jest przydzielona zadnemu realnemu
 * wydawcy — wygenerowana tu karta nie moze przypadkiem przypominac istniejacej.
 */
export const cards = pgTable(
  "cards",
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: uuid()
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    panEncrypted: bytea().notNull(),
    panLast4: char({ length: 4 }).notNull(),
    bin: char({ length: 6 }).notNull(),
    brand: text().notNull().default("DemoCard"),
    kind: cardKind().notNull(),
    expiryMonth: integer().notNull(),
    expiryYear: integer().notNull(),
    cvvEncrypted: bytea().notNull(),
    status: cardStatus().notNull().default("active"),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("cards_account_idx").on(table.accountId),
    // Zasada nienaruszalna nr 9 wymuszona takze w bazie: gdyby kiedykolwiek
    // powstala sciezka omijajaca walidacje w kodzie, karta z realnym BIN-em i
    // tak nie da sie zapisac.
    check("cards_test_bin_only", sql`${table.bin} ~ '^9[0-9]{5}$'`),
    check(
      "cards_expiry_month_range",
      sql`${table.expiryMonth} between 1 and 12`,
    ),
  ],
);

export const cardLimits = pgTable(
  "card_limits",
  {
    cardId: uuid()
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    channel: cardLimitChannel().notNull(),
    period: cardLimitPeriod().notNull(),
    amountMinor: bigint({ mode: "bigint" }).notNull(),
    enabled: boolean().notNull().default(true),
  },
  (table) => [
    primaryKey({ columns: [table.cardId, table.channel, table.period] }),
    check("card_limits_amount_non_negative", sql`${table.amountMinor} >= 0`),
  ],
);
