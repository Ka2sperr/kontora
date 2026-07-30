/**
 * Zrodlo czasu jako zaleznosc, nie jako globalny `new Date()`. Bez tego nie da
 * sie deterministycznie przetestowac wygasania sesji `elevated` (5 min),
 * exponential backoffu przy lockoucie ani waznosci quote'a FX (30 s) — testy
 * musialyby spac, a seeder z sekcji 11 nie bylby powtarzalny.
 */
export interface Clock {
  now(): Date;
}
