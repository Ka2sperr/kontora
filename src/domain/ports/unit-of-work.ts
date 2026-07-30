import type { Repositories } from "@/domain/ports/repositories";

/**
 * Granica transakcji bazodanowej wyrazona bez wspominania o bazie danych
 * (ADR-010).
 *
 * Callback dostaje repozytoria zwiazane z ta jedna transakcja. Wszystko, co w
 * nim zrobisz, zatwierdzi sie razem albo nie zatwierdzi wcale — lacznie z
 * blokadami wierszy, ktore zyja do konca `run`. Wyjatek rzucony z callbacku
 * wycofuje calosc.
 *
 * Repozytoria sa dostepne wylacznie z wnetrza `run`, wiec nie ma sposobu, zeby
 * przypadkiem dopisac zapis do ksiegi poza transakcja.
 */
export interface UnitOfWork {
  run<T>(work: (repos: Repositories) => Promise<T>): Promise<T>;
}
