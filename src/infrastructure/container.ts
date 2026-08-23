import type { AuthDeps } from "@/application/auth/deps";
import type { PostTransactionDeps } from "@/application/ledger/post-transaction";
import { argon2PasswordHasher } from "@/infrastructure/auth/argon2-password-hasher";
import { HibpBreachedPasswordChecker } from "@/infrastructure/auth/hibp-breached-passwords";
import { JwtAccessTokenService } from "@/infrastructure/auth/jwt-access-tokens";
import { randomTokenGenerator } from "@/infrastructure/auth/random-tokens";
import { env } from "@/infrastructure/config/env";
import { sha256Hasher } from "@/infrastructure/crypto/sha256-hasher";
import { db } from "@/infrastructure/db/client";
import { DrizzleAccountQueries } from "@/infrastructure/db/queries/account-queries";
import { DrizzleUnitOfWork } from "@/infrastructure/db/unit-of-work";
import { cryptoIdGenerator } from "@/infrastructure/id/crypto-id-generator";
import { systemClock } from "@/infrastructure/time/system-clock";

/**
 * Korzen kompozycji. Jedyne miejsce, w ktorym powstaja konkretne implementacje
 * portow.
 *
 * Kazdy przypadek uzycia przyjmuje swoje zaleznosci argumentem, wiec test moze
 * podstawic atrape zegara albo hashera bez dotykania tego pliku. Gdyby przypadki
 * uzycia importowaly stad bezposrednio, "testowalne bez bazy i bez frameworka"
 * bylo by tylko deklaracja.
 */

export const unitOfWork = new DrizzleUnitOfWork(db);

export const accessTokenService = new JwtAccessTokenService(
  env.AUTH_SECRET,
  systemClock,
);

export const authDeps: AuthDeps = {
  uow: unitOfWork,
  clock: systemClock,
  ids: cryptoIdGenerator,
  hasher: argon2PasswordHasher,
  breachedPasswords: new HibpBreachedPasswordChecker(
    env.HIBP_ENABLED,
    env.HIBP_TIMEOUT_MS,
  ),
  accessTokens: accessTokenService,
  refreshTokens: randomTokenGenerator,
};

export const ledgerDeps: PostTransactionDeps = {
  uow: unitOfWork,
  clock: systemClock,
};

/**
 * Zapytania odczytowe pracuja poza jednostka pracy.
 *
 * Odczyt do wyswietlenia nie potrzebuje transakcji: nie podejmuje decyzji o
 * pieniadzach i nie blokuje wierszy. Opakowanie go w transakcje kosztowaloby
 * BEGIN/COMMIT przy kazdym renderze listy kont i niczego nie chronilo.
 */
export const accountQueries = new DrizzleAccountQueries(db);

export const auditDeps = {
  uow: unitOfWork,
  hasher: sha256Hasher,
};
