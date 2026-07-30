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
  /**
   * Klucz podpisujacy tokeny dostepu. Minimum 32 znaki, bo HS256 z krotkim
   * kluczem daje podpis, ktory da sie zlamac offline — a wtedy caly mechanizm
   * sesji jest ozdoba.
   */
  AUTH_SECRET: z
    .string()
    .min(32, "AUTH_SECRET musi miec co najmniej 32 znaki"),
  /**
   * Sprawdzanie hasel w bazie wyciekow. Wylaczalne, bo testy i praca bez sieci
   * nie moga zaleznec od cudzego serwera. Domyslnie wlaczone — bezpieczne
   * ustawienie ma byc tym, ktore dostaje sie bez czytania dokumentacji.
   */
  HIBP_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  HIBP_TIMEOUT_MS: z.coerce.number().int().positive().default(3_000),
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
