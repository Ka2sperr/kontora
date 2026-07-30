import { describe, expect, it } from "vitest";
import {
  checkDigit,
  customerNumberForSequence,
  isValidCustomerNumber,
} from "@/domain/auth/customer-number";
import {
  PASSWORD_ATTEMPTS_BEFORE_LOCKOUT,
  PASSWORD_MAX_LOCKOUT_MS,
  PIN_HARD_LOCK_UNTIL,
  isLocked,
  isPinHardLocked,
  passwordLockoutUntil,
  shouldHardLockPin,
} from "@/domain/auth/lockout";
import { checkPasswordShape } from "@/domain/auth/password";
import {
  ELEVATION_DURATION_MS,
  assertElevated,
  elevate,
  elevationSecondsLeft,
  levelOf,
} from "@/domain/auth/session";
import type { SessionClaims } from "@/domain/auth/session";
import { DomainError } from "@/domain/errors";
import { userId } from "@/domain/ids";

const NOW = new Date("2026-07-30T10:00:00.000Z");

/** Pierwsza uzyteczna pozycja od podanej. Co jedenasta odpada z definicji. */
function firstUsableFrom(start: number): string {
  for (let sequence = start; sequence < start + 32; sequence += 1) {
    const customerNumber = customerNumberForSequence(sequence);

    if (customerNumber !== null) {
      return customerNumber;
    }
  }

  throw new Error(`Brak uzytecznej pozycji w okolicy ${start}.`);
}

/** Para numerow z pozycji roznacych sie dokladnie o jeden. */
function adjacentPair(start: number): readonly [string, string] {
  for (let sequence = start; sequence < start + 64; sequence += 1) {
    const first = customerNumberForSequence(sequence);
    const second = customerNumberForSequence(sequence + 1);

    if (first !== null && second !== null) {
      return [first, second];
    }
  }

  throw new Error(`Brak sasiadujacej pary w okolicy ${start}.`);
}

function claims(overrides: Partial<SessionClaims> = {}): SessionClaims {
  return {
    userId: userId("11111111-1111-4111-8111-111111111111"),
    familyId: "22222222-2222-4222-8222-222222222222",
    issuedAt: NOW,
    expiresAt: new Date(NOW.getTime() + 15 * 60 * 1000),
    elevatedUntil: null,
    ...overrides,
  };
}

describe("numer klienta", () => {
  it("cyfra kontrolna zgadza sie z wygenerowanym numerem", () => {
    for (let sequence = 0; sequence < 200; sequence += 1) {
      const customerNumber = customerNumberForSequence(sequence);

      if (customerNumber !== null) {
        expect(isValidCustomerNumber(customerNumber)).toBe(true);
      }
    }
  });

  it("odrzuca numer z podmieniona cyfra", () => {
    const customerNumber = firstUsableFrom(42);
    const firstDigit = Number(customerNumber[0]);
    const tampered = `${(firstDigit + 1) % 10}${customerNumber.slice(1)}`;

    expect(isValidCustomerNumber(tampered)).toBe(false);
  });

  it("wykrywa zamiane sasiednich cyfr", () => {
    // Najczestsza pomylka przy przepisywaniu numeru. Wagi rosnace 2..8 sa dobrane
    // wlasnie po to, zeby taka zamiana zmieniala sume kontrolna.
    const base = "1234567";
    const digit = checkDigit(base);
    const swapped = "1234576";

    expect(digit).not.toBeNull();
    expect(checkDigit(swapped)).not.toBe(digit);
  });

  it("kolejne pozycje sekwencji daja odlegle numery", () => {
    // Sedno wymogu "numery nie sa enumerowalne": znajomosc jednego numeru nie ma
    // dawac nastepnego przez dodanie jedynki.
    const [first, second] = adjacentPair(1000);

    expect(Math.abs(Number(first) - Number(second))).toBeGreaterThan(1_000_000);
  });

  it("rozne pozycje sekwencji nigdy nie daja tego samego numeru", () => {
    // Wlasnie ta asercja wykryla blad: wczesniejsza wersja przy pozycji bez
    // poprawnej cyfry kontrolnej przeskakiwala do nastepnej i zwracala jej numer,
    // przez co pozycje 5 i 6 dostawaly ten sam. Dwoje klientow, jeden numer.
    const seen = new Set<string>();
    let usable = 0;

    for (let sequence = 0; sequence < 5_000; sequence += 1) {
      const customerNumber = customerNumberForSequence(sequence);

      if (customerNumber === null) {
        continue;
      }

      usable += 1;
      seen.add(customerNumber);
    }

    expect(seen.size).toBe(usable);
    // Odpada mniej wiecej co jedenasta pozycja — ta, dla ktorej reszta mod 11
    // wynosi 10. Asercja pilnuje, ze odpada tyle, ile powinno: gdyby nie odpadala
    // zadna, cyfra kontrolna nie bylaby liczona mod 11.
    expect(usable).toBeGreaterThan(4_400);
    expect(usable).toBeLessThan(4_700);
  });

  it("odrzuca wartosci o zlym ksztalcie", () => {
    expect(isValidCustomerNumber("1234567")).toBe(false);
    expect(isValidCustomerNumber("123456789")).toBe(false);
    expect(isValidCustomerNumber("abcdefgh")).toBe(false);
  });
});

describe("polityka hasel", () => {
  it("odrzuca haslo krotsze niz dwanascie znakow", () => {
    expect(checkPasswordShape("krotkie123")?.reason).toBe("too_short");
  });

  it("liczy dlugosc w punktach kodowych, nie w jednostkach UTF-16", () => {
    // Dwanascie emoji ma `length` rowne 24, ale to wciaz dwanascie znakow.
    // Wersja liczaca `length` przepuscilaby szesc emoji jako "dwanascie znakow".
    const sixEmoji = "🔒🔑🛡️🧾💳🏦";

    expect(checkPasswordShape(sixEmoji)?.reason).toBe("too_short");
  });

  it("przyjmuje dluga fraze bez znakow specjalnych", () => {
    // Zgodnie z NIST SP 800-63B: dlugosc zamiast wymogow kompozycji.
    expect(checkPasswordShape("kot przeszedl przez ulice")).toBeNull();
  });

  it("odrzuca same spacje", () => {
    expect(checkPasswordShape("               ")?.reason).toBe("whitespace_only");
  });
});

describe("blokady", () => {
  it("nie blokuje przed piata nieudana proba", () => {
    for (let attempts = 0; attempts < PASSWORD_ATTEMPTS_BEFORE_LOCKOUT; attempts += 1) {
      expect(passwordLockoutUntil(attempts, NOW)).toBeNull();
    }
  });

  it("blokuje na kwadrans przy piatej probie", () => {
    const until = passwordLockoutUntil(5, NOW);

    expect(until?.getTime()).toBe(NOW.getTime() + 15 * 60 * 1000);
  });

  it("podwaja czas blokady z kazda kolejna proba", () => {
    expect(passwordLockoutUntil(6, NOW)?.getTime()).toBe(
      NOW.getTime() + 30 * 60 * 1000,
    );
    expect(passwordLockoutUntil(7, NOW)?.getTime()).toBe(
      NOW.getTime() + 60 * 60 * 1000,
    );
  });

  it("nie przekracza doby", () => {
    // Bez gornego ograniczenia blokada po czterdziestu probach siegnelaby lat, a
    // wtedy pomylka wlasciciela konta zamienia sie w trwala utrate dostepu —
    // czyli w atak odmowy uslugi wykonany naszymi rekami.
    const until = passwordLockoutUntil(40, NOW);

    expect(until?.getTime()).toBe(NOW.getTime() + PASSWORD_MAX_LOCKOUT_MS);
  });

  it("blokada mija razem z uplywem czasu", () => {
    const until = passwordLockoutUntil(5, NOW);

    expect(isLocked(until, NOW)).toBe(true);
    expect(isLocked(until, new Date(NOW.getTime() + 15 * 60 * 1000))).toBe(false);
  });

  it("PIN blokuje sie twardo po trzech probach", () => {
    expect(shouldHardLockPin(2)).toBe(false);
    expect(shouldHardLockPin(3)).toBe(true);
    expect(isPinHardLocked(PIN_HARD_LOCK_UNTIL)).toBe(true);
    expect(isPinHardLocked(null)).toBe(false);
    expect(isPinHardLocked(new Date(NOW.getTime() + 60_000))).toBe(false);
  });
});

describe("poziomy sesji", () => {
  it("swieza sesja jest tylko uwierzytelniona", () => {
    expect(levelOf(claims(), NOW)).toBe("authenticated");
  });

  it("PIN podnosi sesje na piec minut", () => {
    const elevated = elevate(claims(), NOW);

    expect(levelOf(elevated, NOW)).toBe("elevated");
    expect(elevationSecondsLeft(elevated, NOW)).toBe(300);
  });

  it("podniesienie wygasa co do sekundy", () => {
    const elevated = elevate(claims(), NOW);
    const justBefore = new Date(NOW.getTime() + ELEVATION_DURATION_MS - 1);
    const exactly = new Date(NOW.getTime() + ELEVATION_DURATION_MS);

    expect(levelOf(elevated, justBefore)).toBe("elevated");
    expect(levelOf(elevated, exactly)).toBe("authenticated");
  });

  it("operacja pieniezna odrzuca sesje bez podniesienia", () => {
    expect(() => assertElevated(claims(), NOW, "transfer")).toThrowError(
      DomainError,
    );

    expect(() =>
      assertElevated(elevate(claims(), NOW), NOW, "transfer"),
    ).not.toThrow();
  });

  it("wygasla sesja nie da sie podniesc do niczego", () => {
    const expired = claims({ expiresAt: new Date(NOW.getTime() - 1) });

    expect(() => assertElevated(expired, NOW, "transfer")).toThrowError(
      /wygasla/i,
    );
  });
});
