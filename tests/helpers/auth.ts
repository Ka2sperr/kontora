import { randomUUID } from "node:crypto";
import type { AuthDeps, RequestContext } from "@/application/auth/deps";
import type { Clock } from "@/domain/ports/clock";
import { argon2PasswordHasher } from "@/infrastructure/auth/argon2-password-hasher";
import { JwtAccessTokenService } from "@/infrastructure/auth/jwt-access-tokens";
import { randomTokenGenerator } from "@/infrastructure/auth/random-tokens";
import { db } from "@/infrastructure/db/client";
import { DrizzleUnitOfWork } from "@/infrastructure/db/unit-of-work";
import { cryptoIdGenerator } from "@/infrastructure/id/crypto-id-generator";

/**
 * Zegar sterowany z testu. Istnieje po to, zeby test blokady na kwadrans trwal
 * milisekundy — bez portu `Clock` jedynym sposobem sprawdzenia, ze blokada mija,
 * byloby odczekanie pietnastu minut.
 */
export class TestClock implements Clock {
  constructor(private current: Date = new Date("2026-07-30T10:00:00.000Z")) {}

  now(): Date {
    return new Date(this.current);
  }

  advanceMs(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }

  advanceMinutes(minutes: number): void {
    this.advanceMs(minutes * 60 * 1000);
  }
}

/**
 * Sprawdzanie hasel w bazie wyciekow wylaczone w testach: test, ktory dzwoni po
 * sieci, jest testem cudzej dostepnosci. Sam adapter HIBP ma osobny test.
 */
const noBreaches = { occurrences: async () => 0 };

export function testAuthDeps(clock: Clock): AuthDeps {
  return {
    // Wlasna jednostka pracy z tym samym zegarem, ktorym steruje test. Dzieki temu
    // wpisy logu audytu maja czas testowy, a nie systemowy — inaczej okno limitu
    // prob i wpisy, ktore zlicza, mierzylyby sie roznymi zegarami.
    uow: new DrizzleUnitOfWork(db, clock),
    clock,
    ids: cryptoIdGenerator,
    hasher: argon2PasswordHasher,
    breachedPasswords: noBreaches,
    accessTokens: new JwtAccessTokenService(
      "sekret-testowy-o-dlugosci-ponad-trzydziestu-dwoch-znakow",
      clock,
    ),
    refreshTokens: randomTokenGenerator,
  };
}

/**
 * Kazdy test dostaje wlasny adres.
 *
 * Limit prob liczy sie per adres w oknie kwadransa, a testy zapisuja wpisy pod
 * czasem sterowanego zegara — wiec przy wspolnym adresie kolejne uruchomienia
 * calego zestawu sumowalyby sie i predzej czy pozniej przekroczyly limit. Test,
 * ktory psuje sie przy czwartym uruchomieniu, jest gorszy niz brak testu.
 *
 * Kolumna `ip` jest tekstowa, wiec wartosc nie musi byc poprawnym adresem —
 * musi byc unikalna.
 */
export function testContext(): RequestContext {
  return { ip: `test-${randomUUID()}`, userAgent: "vitest" };
}

/** Wspolny adres dla testow, ktore sprawdzaja wlasnie ograniczanie prob. */
export const SHARED_TEST_CONTEXT: RequestContext = {
  ip: "203.0.113.10",
  userAgent: "vitest",
};

let emailCounter = 0;

export function uniqueEmail(): string {
  emailCounter += 1;

  return `test-${Date.now()}-${emailCounter}@example.invalid`;
}

export const STRONG_PASSWORD = "poprawne-haslo-testowe-2026";
