import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * Migracje uruchamiane na osobnym, jednopolaczeniowym kliencie (`max: 1`).
 * Wspoldzielenie puli z aplikacja przy DDL grozi zakleszczeniem: jedno
 * polaczenie trzyma blokade na tabeli, inne czeka na to samo w kolejce puli.
 */
async function main(): Promise<void> {
  const url = process.env["DATABASE_URL"];

  if (!url) {
    throw new Error(
      "DATABASE_URL nie jest ustawiony. Skopiuj .env.example do .env i uzupelnij.",
    );
  }

  const connection = postgres(url, { max: 1 });

  try {
    await migrate(drizzle(connection), {
      migrationsFolder: "./src/infrastructure/db/migrations",
    });
    console.log("Migracje zastosowane.");
  } finally {
    await connection.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
