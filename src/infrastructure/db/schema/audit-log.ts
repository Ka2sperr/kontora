import {
  bigserial,
  char,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Log audytu odporny na manipulacje. Kazdy wpis zawiera skrot poprzedniego, wiec
 * zmiana czegokolwiek w srodku lancucha rozspaja go w tym miejscu i dalej.
 *
 * To nie czyni logu niezmiennym — kto ma prawa do bazy, moze przeliczyc caly
 * lancuch od nowa. Czyni go *wykrywalnie* zmienionym, a to inna i realniejsza
 * gwarancja: `/api/audit/verify` wskazuje numer wpisu, na ktorym lancuch pekl.
 * Tabela jest tylko do dopisywania, wymuszone tym samym wyzwalaczem co ksiega.
 *
 * `metadata` nigdy nie zawiera PAN, CVV, PIN-u ani hasla (zasada nienaruszalna
 * nr 8). Wpis CARD_REVEAL odnotowuje, ze numer zostal pokazany — nie jaki.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    seq: bigserial({ mode: "bigint" }).primaryKey(),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    action: text().notNull(),
    entity: text(),
    entityId: text(),
    metadata: jsonb().notNull().default({}),
    ip: text(),
    userAgent: text(),
    prevHash: char({ length: 64 }).notNull(),
    hash: char({ length: 64 }).notNull().unique(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_log_user_idx").on(table.userId, table.seq.desc()),
    index("audit_log_action_idx").on(table.action, table.seq.desc()),
  ],
);
