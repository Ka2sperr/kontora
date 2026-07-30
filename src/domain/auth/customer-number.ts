import { DomainError } from "@/domain/errors";

/**
 * Numer klienta: 7 cyfr + cyfra kontrolna mod 11.
 *
 * Specyfikacja wymaga, zeby numery nie byly enumerowalne. Losowanie z ponawianiem
 * przy kolizji dzialaloby, ale wymaga zapytania do bazy przy kazdej probie i z
 * czasem degeneruje sie w petle. Zamiast tego stosujemy mnozenie modularne:
 *
 *     rozproszony = (kolejny * MIXER) mod 10^7
 *
 * `MIXER` jest wzglednie pierwszy z 10^7, wiec odwzorowanie jest bijekcja na calym
 * zakresie: kolejne numery sekwencji daja numery klienta odlegle od siebie, zadne
 * dwa sie nie powtarzaja, a zaden nie wymaga sprawdzania w bazie. Cena: kto pozna
 * MIXER, odtworzy kolejnosc rejestracji. To nie jest sekret kryptograficzny i nie
 * udaje nim byc — chroni przed skanowaniem numerow z ulicy, nie przed analiza.
 */

const RANGE = 10_000_000; // 10^7 — siedem cyfr
const MIXER = 3_141_593; // liczba pierwsza, wzglednie pierwsza z 10^7

/**
 * Wagi mod 11 dla siedmiu cyfr. Rosnace wagi 2..8 to najczestszy wariant tego
 * schematu; rozroznia kazda zamiane sasiednich cyfr, ktora jest najczestsza
 * pomylka przy przepisywaniu.
 */
const WEIGHTS = [2, 3, 4, 5, 6, 7, 8] as const;

export function checkDigit(sevenDigits: string): number | null {
  if (!/^\d{7}$/.test(sevenDigits)) {
    throw new DomainError(
      "INVALID_CUSTOMER_NUMBER",
      "Do wyliczenia cyfry kontrolnej potrzeba dokladnie siedmiu cyfr.",
    );
  }

  let sum = 0;

  for (const [index, weight] of WEIGHTS.entries()) {
    sum += Number(sevenDigits[index]) * weight;
  }

  const remainder = sum % 11;
  const digit = (11 - remainder) % 11;

  // Reszta dajaca 10 nie miesci sie w jednej cyfrze. Numer z takim wynikiem jest
  // pomijany — dlatego generator musi umiec przejsc do nastepnego.
  return digit === 10 ? null : digit;
}

export function isValidCustomerNumber(value: string): boolean {
  if (!/^\d{8}$/.test(value)) {
    return false;
  }

  const expected = checkDigit(value.slice(0, 7));

  return expected !== null && expected === Number(value[7]);
}

export function assertCustomerNumber(value: string): string {
  if (!isValidCustomerNumber(value)) {
    throw new DomainError(
      "INVALID_CUSTOMER_NUMBER",
      "Numer klienta ma 8 cyfr, a ostatnia jest cyfra kontrolna.",
    );
  }

  return value;
}

/**
 * Numer klienta dla podanej pozycji w sekwencji, albo `null`, gdy tej pozycji nie
 * da sie uzyc.
 *
 * `null` pojawia sie dla mniej wiecej co jedenastej pozycji — tej, dla ktorej
 * reszta mod 11 wynosi 10 i cyfra kontrolna nie miesci sie w jednej cyfrze.
 * Wolajacy ma wtedy pobrac **kolejna** wartosc z sekwencji, a nie przesunac sie
 * o jeden w tej samej.
 *
 * To rozroznienie jest cala poprawnoscia tej funkcji. Wersja, ktora sama
 * przeskakuje do nastepnej dzialajacej pozycji, przypisuje pozycji 5 numer
 * pozycji 6 — a potem pozycji 6 ten sam numer. Odwzorowanie przestaje byc
 * roznowartosciowe i dwoje klientow dostaje ten sam numer. Znalazl to test
 * sprawdzajacy brak powtorzen na piec tysiacach pozycji.
 *
 * Odwzorowanie jest deterministyczne: ta sama pozycja zawsze daje ten sam numer,
 * wiec seeder tworzy powtarzalne dane.
 */
export function customerNumberForSequence(sequence: number): string | null {
  if (!Number.isInteger(sequence) || sequence < 0) {
    throw new DomainError(
      "INVALID_CUSTOMER_NUMBER",
      "Pozycja w sekwencji musi byc nieujemna liczba calkowita.",
    );
  }

  const base = String((sequence * MIXER) % RANGE).padStart(7, "0");
  const digit = checkDigit(base);

  return digit === null ? null : `${base}${digit}`;
}
