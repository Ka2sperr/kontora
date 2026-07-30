import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDatabase, db } from "@/infrastructure/db/client";

/**
 * Ten test pilnuje konfiguracji sterownika, nie logiki. Bez niego zasada
 * nienaruszalna nr 1 opiera sie na jednej linijce konfiguracji, ktora kazdy moze
 * usunac przy porzadkach, a nic nie zrobi sie czerwone az do produkcji.
 */

afterAll(async () => {
  await closeDatabase();
});

describe("polaczenie z baza", () => {
  it("laczy sie z Postgresem", async () => {
    const rows = await db.execute<{ ok: number }>(sql`select 1 as ok`);

    expect(rows[0]?.ok).toBe(1);
  });

  it("zwraca int8 jako bigint, a nie jako string ani number", async () => {
    // 9 007 199 254 740 993 = Number.MAX_SAFE_INTEGER + 2. Gdyby sterownik oddal
    // te wartosc jako number, wrocilaby cicho zaokraglona.
    const rows = await db.execute<{ value: bigint }>(
      sql`select 9007199254740993::int8 as value`,
    );
    const value = rows[0]?.value;

    expect(typeof value).toBe("bigint");
    expect(value).toBe(9_007_199_254_740_993n);
  });

  it("pracuje w strefie o zerowym przesunieciu", async () => {
    // Znaczniki czasu w ksiedze musza byc porownywalne miedzy maszyna
    // deweloperska, CI i produkcja. Sprawdzam przesuniecie, nie nazwe strefy:
    // "UTC", "Etc/UTC" i "UCT" to ta sama strefa o roznych etykietach, a asercja
    // na etykiecie bylaby czerwona z powodu, ktory nikogo nie interesuje.
    const rows = await db.execute<{ isUtc: boolean }>(
      sql`select (now() at time zone current_setting('TimeZone'))
               = (now() at time zone 'UTC') as "isUtc"`,
    );

    expect(rows[0]?.isUtc).toBe(true);
  });
});
