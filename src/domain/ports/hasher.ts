/**
 * Skrot kryptograficzny jako port.
 *
 * Domena nie siega po `node:crypto` z tego samego powodu, dla ktorego nie siega
 * po Drizzle: straznik architektury nie wpuszcza do `src/domain/` zadnego importu
 * spoza domeny. Efekt uboczny jest przyjemny — lancuch skrotow logu audytu
 * testuje sie atrapa, ktora zwraca przewidywalne wartosci, wiec test sprawdza
 * strukture lancucha, a nie implementacje SHA-256.
 */
export interface Hasher {
  sha256Hex(input: string): string;
}
