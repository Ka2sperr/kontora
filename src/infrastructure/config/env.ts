import { z } from "zod";

/**
 * Konfiguracja walidowana raz, przy starcie procesu. Zmienne dochodza
 * etapami — kazda nowa trafia tu ORAZ do .env.example w tym samym commicie.
 */
const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL jest wymagany")
    .refine(
      (value) =>
        value.startsWith("postgres://") || value.startsWith("postgresql://"),
      "DATABASE_URL musi byc connection stringiem Postgresa",
    ),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    // Wypisujemy nazwy zmiennych i powody, nigdy wartosci — connection string
    // zawiera haslo, a ten komunikat trafia do logow.
    const details = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");

    throw new Error(`Niepoprawna konfiguracja srodowiska:\n${details}`);
  }

  return parsed.data;
}

export const env: Env = loadEnv();
