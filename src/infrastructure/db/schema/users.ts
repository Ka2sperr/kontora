import {
  boolean,
  char,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  // 7 cyfr z przemieszanej sekwencji + cyfra kontrolna mod 11 (Etap 2).
  customerNumber: char({ length: 8 }).notNull().unique(),
  passwordHash: text().notNull(),
  pinHash: text(),
  firstName: text().notNull(),
  lastName: text().notNull(),
  email: text().notNull().unique(),
  isDemo: boolean().notNull().default(false),
  passwordFailed: integer().notNull().default(0),
  passwordLockedUntil: timestamp({ withTimezone: true }),
  pinFailed: integer().notNull().default(0),
  pinLockedUntil: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Cala rodzina uniewazniana naraz przy wykryciu ponownego uzycia tokena.
    familyId: uuid().notNull(),
    parentId: uuid(),
    // sha256 tokena. Plaintext nie istnieje w bazie ani w logach.
    tokenHash: text().notNull().unique(),
    usedAt: timestamp({ withTimezone: true }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    revokedAt: timestamp({ withTimezone: true }),
    ip: text(),
    userAgent: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("refresh_tokens_user_idx").on(table.userId),
    // Uniewaznienie rodziny to jedno zapytanie po tym indeksie; bez niego
    // reakcja na wykryta kradziez tokena skanowalaby cala tabele.
    index("refresh_tokens_family_idx").on(table.familyId),
  ],
);
