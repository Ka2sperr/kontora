import { defineConfig } from "vitest/config";

/**
 * Testy wymagajace prawdziwego Postgresa (triggery append-only, constrainty,
 * blokady wierszy, wspolbieznosc). Osobna konfiguracja, bo:
 *  - `fileParallelism: false` — testy dziela jedna baze, rownolegle pliki
 *    walczylyby o te same wiersze i falszowaly wynik testu wspolbieznosci,
 *  - dluzszy timeout — 200 rownoleglych przelewow to nie jednostka.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/{integration,concurrency}/**/*.test.ts"],
    // Lokalnie DATABASE_URL pochodzi z .env; w CI zmienna jest juz w srodowisku,
    // a dotenv istniejacych wartosci nie nadpisuje.
    setupFiles: ["dotenv/config"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    passWithNoTests: true,
  },
});
