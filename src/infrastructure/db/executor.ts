import type { Database } from "@/infrastructure/db/client";

/**
 * Cokolwiek, na czym da sie wykonac zapytanie: pula polaczen albo transakcja.
 *
 * Repozytoria przyjmuja ten typ zamiast konkretnego `Database`, dzieki czemu ten
 * sam kod obsluguje odczyt poza transakcja i zapis wewnatrz niej. Bez tego
 * istnialyby dwie rownolegle implementacje kazdego repozytorium, ktore z czasem
 * rozjezdzalyby sie w szczegolach.
 */
export type DbTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

export type DbExecutor = Database | DbTransaction;
