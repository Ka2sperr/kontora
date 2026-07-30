import type { NextRequest } from "next/server";
import { z } from "zod";

/**
 * Walidacja wejscia na granicy HTTP (sekcja 3: Zod na kazdej granicy wejscia).
 *
 * Blad walidacji to 400 z lista pol, a nie 500 z wyjatkiem. Zle uzupelniony
 * formularz jest normalnym zdarzeniem, nie awaria — i nie powinien wygladac w
 * logach jak awaria, bo wtedy prawdziwe awarie gina w szumie.
 */
export class ValidationError extends Error {
  readonly issues: readonly { path: string; message: string }[];

  constructor(issues: readonly { path: string; message: string }[]) {
    super("Niepoprawne dane wejsciowe.");
    this.name = "ValidationError";
    this.issues = issues;
  }
}

export async function parseBody<T extends z.ZodTypeAny>(
  request: NextRequest,
  schema: T,
): Promise<z.infer<T>> {
  let raw: unknown;

  try {
    raw = await request.json();
  } catch {
    throw new ValidationError([
      { path: "(body)", message: "Oczekiwano poprawnego JSON-a." },
    ]);
  }

  const parsed = schema.safeParse(raw);

  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({
        path: issue.path.join(".") || "(root)",
        message: issue.message,
      })),
    );
  }

  return parsed.data;
}

/**
 * Odrzucenie wejscia wygladajacego na prawdziwy numer karty (sekcja 14).
 *
 * Sprawdzenie jest celowo waskie: prefiks znanego wydawcy ORAZ poprawna suma
 * Luhna. Sam ciag cyfr to za malo — numer konta, numer telefonu i identyfikator
 * zamowienia tez sa ciagami cyfr, a fałszywe odrzucenie przelewu byloby gorsze niz
 * brak sprawdzenia.
 */
const REAL_CARD_PREFIXES = /^(4|5[1-5]|34|37|6011|35\d\d)/;

export function looksLikeRealPan(value: string): boolean {
  const digits = value.replace(/[\s-]/g, "");

  if (!/^\d{13,19}$/.test(digits)) {
    return false;
  }

  if (!REAL_CARD_PREFIXES.test(digits)) {
    return false;
  }

  return passesLuhn(digits);
}

export function passesLuhn(digits: string): boolean {
  let sum = 0;
  let double = false;

  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);

    if (double) {
      digit *= 2;

      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    double = !double;
  }

  return sum % 10 === 0;
}

export const REAL_PAN_MESSAGE =
  "To wyglada na numer prawdziwej karty platniczej. Kontora jest aplikacja demonstracyjna i nie przyjmuje takich danych — nawet do testow, bo nie ma bezpiecznego sposobu ich przechowania. Uzyj numeru testowego zaczynajacego sie od cyfry 9.";

/**
 * Pole tekstowe, ktore odrzuca wejscie wygladajace na prawdziwy numer karty.
 * Uzywane wszedzie, gdzie uzytkownik wpisuje dowolny tekst — tytul przelewu jest
 * najczestszym miejscem, w ktorym ktos wkleja numer karty "zeby pamietac".
 */
export function safeText(maxLength: number) {
  return z
    .string()
    .trim()
    .min(1)
    .max(maxLength)
    .refine((value) => !looksLikeRealPan(value), REAL_PAN_MESSAGE);
}
