import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/infrastructure/config/env";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

const connection = postgres(env.DATABASE_URL, {
  max: 20,
  // Kluczowe dla zasady nienaruszalnej nr 1: bez tego sterownik zwraca int8 jako
  // string, a pierwszy nieuwazny Number() na kwocie traci precyzje po cichu,
  // bez zadnego bledu. Tu int8 wraca jako BigInt albo nie wraca wcale.
  types: { bigint: postgres.BigInt },
  onnotice: () => {},
});

function createDatabase(): Database {
  return drizzle(connection, { schema, casing: "snake_case" });
}

// Next.js w trybie dev przeladowuje moduly przy kazdej zmianie; bez cache na
// globalThis kazde przeladowanie otwieraloby nowa pule polaczen.
const globalForDb = globalThis as { kontoraDb?: Database };

export const db: Database = globalForDb.kontoraDb ?? createDatabase();

if (env.NODE_ENV !== "production") {
  globalForDb.kontoraDb = db;
}

/**
 * Zamyka pule polaczen. Wylacznie dla procesow, ktore maja koniec: testow
 * integracyjnych i skryptow. Serwer aplikacji nigdy tego nie wola — otwarta pula
 * jest tam stanem docelowym, a nie wyciekiem.
 */
export async function closeDatabase(): Promise<void> {
  await connection.end();
}
