import type { Repositories } from "@/domain/ports/repositories";
import type { Clock } from "@/domain/ports/clock";
import type { UnitOfWork } from "@/domain/ports/unit-of-work";
import type { Database } from "@/infrastructure/db/client";
import type { DbExecutor } from "@/infrastructure/db/executor";
import { systemClock } from "@/infrastructure/time/system-clock";
import { sha256Hasher } from "@/infrastructure/crypto/sha256-hasher";
import { DrizzleAccountRepository } from "@/infrastructure/db/repositories/account-repository";
import { DrizzleAuditLogRepository } from "@/infrastructure/db/repositories/audit-log-repository";
import { DrizzleLedgerRepository } from "@/infrastructure/db/repositories/ledger-repository";
import {
  AuditLogAttemptCounter,
  DrizzleRefreshTokenRepository,
} from "@/infrastructure/db/repositories/refresh-token-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { DrizzleTransactionRepository } from "@/infrastructure/db/repositories/transaction-repository";

/**
 * Zegar jest parametrem, a nie stala.
 *
 * Log audytu stempluje wpisy czasem, ktory wchodzi do materialu skrotu, a licznik
 * prob logowania porownuje ten czas z oknem liczonym od `deps.clock`. Gdyby jedno
 * bralo czas z systemu, a drugie ze sterowanego zegara testu, okno i wpisy
 * mierzylyby sie roznymi linijkami — i limit prob dzialalby losowo.
 */
export function repositoriesFor(
  executor: DbExecutor,
  clock: Clock = systemClock,
): Repositories {
  return {
    accounts: new DrizzleAccountRepository(executor),
    transactions: new DrizzleTransactionRepository(executor),
    ledger: new DrizzleLedgerRepository(executor),
    audit: new DrizzleAuditLogRepository(executor, sha256Hasher, clock),
    users: new DrizzleUserRepository(executor),
    refreshTokens: new DrizzleRefreshTokenRepository(executor),
    attempts: new AuditLogAttemptCounter(executor),
  };
}

/**
 * Implementacja granicy transakcji z ADR-010.
 *
 * Repozytoria wstrzykiwane do callbacku sa zwiazane z ta jedna transakcja. Nie ma
 * sposobu, zeby z wnetrza `run` siegnac po repozytorium spoza niej — a gdyby byl,
 * czesc zapisow przelewu zatwierdzalaby sie niezaleznie od reszty.
 *
 * Poziom izolacji zostaje domyslny (READ COMMITTED). Przy pesymistycznym
 * blokowaniu wierszy SERIALIZABLE nie dokladalby tu bezpieczenstwa, a dokladalby
 * bledy serializacji do obslugi — czyli kod, ktory nigdy nie jest przetestowany
 * tak dobrze jak sciezka glowna.
 */
export class DrizzleUnitOfWork implements UnitOfWork {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock = systemClock,
  ) {}

  async run<T>(work: (repos: Repositories) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) =>
      work(repositoriesFor(tx, this.clock)),
    );
  }
}
