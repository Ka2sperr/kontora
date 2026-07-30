import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const url = process.env["DATABASE_URL"];

if (!url) {
  throw new Error(
    "DATABASE_URL nie jest ustawiony. Skopiuj .env.example do .env i uzupelnij.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/infrastructure/db/schema/index.ts",
  out: "./src/infrastructure/db/migrations",
  dbCredentials: { url },
  // Ta sama konwencja co w kliencie (src/infrastructure/db/client.ts). Rozjazd
  // miedzy generatorem migracji a runtime'em oznaczalby zapytania do kolumn,
  // ktorych nie ma.
  casing: "snake_case",
  // Migracje sa wersjonowane i commitowane; `push` bez migracji jest zakazany,
  // bo zabiera mozliwosc odtworzenia historii schematu.
  strict: true,
  verbose: true,
});
