import {
  AUTH_ACTIONS,
  type AuthDeps,
  type RequestContext,
} from "@/application/auth/deps";
import {
  type IssuedSession,
  issueSession,
} from "@/application/auth/session-tokens";
import {
  isLocked,
  lockSecondsLeft,
  passwordLockoutUntil,
} from "@/domain/auth/lockout";
import { type PublicUser, toPublicUser } from "@/domain/auth/user";
import { DomainError } from "@/domain/errors";
import type { Repositories } from "@/domain/ports/repositories";

/**
 * Okno i limit prob z jednego adresu. Liczy wszystkie nieudane logowania, takze
 * te na nieistniejace numery klienta — bo wlasnie tak wyglada skanowanie.
 *
 * Limit per adres jest luzniejszy niz per konto, bo za jednym adresem moze siedziec
 * cale biuro. Zbyt ostry limit zamienilby ochrone w awarie dla postronnych.
 */
const IP_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const IP_ATTEMPT_LIMIT = 30;

export interface LoginInput {
  readonly customerNumber: string;
  readonly password: string;
}

export interface LoginResult extends IssuedSession {
  readonly user: PublicUser;
}

/**
 * Logowanie numerem klienta i haslem. Daje sesje poziomu `authenticated` —
 * przelew bedzie jeszcze wymagal PIN-u (ADR-002).
 */
export async function login(
  deps: AuthDeps,
  input: LoginInput,
  context: RequestContext,
): Promise<LoginResult> {
  const now = deps.clock.now();

  await assertIpNotFlooding(deps, context, now);

  const user = await deps.uow.run((repos) =>
    repos.users.findByCustomerNumber(input.customerNumber),
  );

  if (user === null) {
    // Weryfikacja wzgledem stalego hasha, mimo ze wynik jest z gory znany.
    // Bez tego odpowiedz dla nieistniejacego numeru wracalaby o rzad wielkosci
    // szybciej niz dla istniejacego, co pozwala odgadnac, ktore numery istnieja.
    await deps.hasher.verify(await timingEqualizerHash(deps), input.password);

    await recordUnknownCustomer(deps, input.customerNumber, context);

    throw invalidCredentials();
  }

  if (isLocked(user.passwordLockedUntil, now)) {
    await deps.uow.run((repos) =>
      repos.audit.append({
        userId: user.id,
        action: AUTH_ACTIONS.loginLocked,
        entity: "user",
        entityId: user.id,
        metadata: { secondsLeft: lockSecondsLeft(user.passwordLockedUntil, now) },
        ip: context.ip,
        userAgent: context.userAgent,
      }),
    );

    throw new DomainError(
      "ACCOUNT_LOCKED",
      `Konto jest tymczasowo zablokowane po nieudanych probach logowania. Sprobuj za ${Math.ceil(
        lockSecondsLeft(user.passwordLockedUntil, now) / 60,
      )} min.`,
    );
  }

  const passwordOk = await deps.hasher.verify(user.passwordHash, input.password);

  if (!passwordOk) {
    await deps.uow.run(async (repos) => {
      const failures = await repos.users.recordPasswordFailure(user.id);
      const lockUntil = passwordLockoutUntil(failures, now);

      if (lockUntil !== null) {
        await repos.users.setPasswordLock(user.id, lockUntil);
      }

      await repos.audit.append({
        userId: user.id,
        action: AUTH_ACTIONS.loginFailed,
        entity: "user",
        entityId: user.id,
        metadata: { failures, locked: lockUntil !== null },
        ip: context.ip,
        userAgent: context.userAgent,
      });
    });

    throw invalidCredentials();
  }

  return deps.uow.run(async (repos) => {
    await repos.users.clearPasswordFailures(user.id);

    // Poprawne haslo zdejmuje twarda blokade PIN-u. To jedyna droga jej zdjecia
    // (sekcja 6.1): PIN chroni pojedyncza operacje, haslo chroni konto, wiec to
    // haslo ma prawo przywrocic PIN do gry.
    if (user.pinFailed > 0 || user.pinLockedUntil !== null) {
      await repos.users.clearPinFailures(user.id);

      await repos.audit.append({
        userId: user.id,
        action: AUTH_ACTIONS.pinUnlocked,
        entity: "user",
        entityId: user.id,
        metadata: { reason: "password_reauth" },
        ip: context.ip,
        userAgent: context.userAgent,
      });
    }

    await rehashIfNeeded(deps, repos, user.id, user.passwordHash, input.password);

    const session = await issueSession(deps, repos, {
      userId: user.id,
      familyId: deps.ids.uuid(),
      parentId: null,
      elevatedUntil: null,
      context,
    });

    await repos.audit.append({
      userId: user.id,
      action: AUTH_ACTIONS.loginSuccess,
      entity: "session",
      entityId: session.familyId,
      metadata: { customerNumber: user.customerNumber },
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return { ...session, user: toPublicUser(user) };
  });
}

/**
 * Hash do wyrownywania czasu odpowiedzi.
 *
 * Liczony raz, przy pierwszej probie logowania na nieistniejacy numer, i
 * zapamietywany. Wpisanie gotowej wartosci w kod bylo by krotsze, ale przestaloby
 * dzialac po kazdej zmianie parametrow Argon2id — a przestaloby po cichu, bo
 * weryfikacja wobec niepasujacego formatu konczy sie natychmiast i wlasnie ta
 * roznice czasu mial usunac.
 */
let equalizerHash: Promise<string> | null = null;

function timingEqualizerHash(deps: AuthDeps): Promise<string> {
  equalizerHash ??= deps.hasher.hash(
    "kontora-staly-material-do-wyrownania-czasu",
  );

  return equalizerHash;
}

function invalidCredentials(): DomainError {
  // Jeden komunikat dla zlego numeru i dla zlego hasla. Rozroznienie
  // podpowiadaloby, ktore numery klienta istnieja.
  return new DomainError(
    "INVALID_CREDENTIALS",
    "Numer klienta lub haslo sa niepoprawne.",
  );
}

async function assertIpNotFlooding(
  deps: AuthDeps,
  context: RequestContext,
  now: Date,
): Promise<void> {
  if (context.ip === null) {
    return;
  }

  const attempts = await deps.uow.run((repos) =>
    repos.attempts.count({
      action: AUTH_ACTIONS.loginFailed,
      subject: `ip:${context.ip}`,
      since: new Date(now.getTime() - IP_ATTEMPT_WINDOW_MS),
    }),
  );

  if (attempts >= IP_ATTEMPT_LIMIT) {
    throw new DomainError(
      "RATE_LIMITED",
      "Zbyt wiele nieudanych prob logowania z tego adresu. Odczekaj kwadrans.",
    );
  }
}

async function recordUnknownCustomer(
  deps: AuthDeps,
  customerNumber: string,
  context: RequestContext,
): Promise<void> {
  await deps.uow.run((repos) =>
    repos.audit.append({
      userId: null,
      action: AUTH_ACTIONS.loginFailed,
      entity: "user",
      entityId: null,
      // Numer klienta w metadanych, bo bez niego wpis nie pozwala odroznic
      // skanowania numerow od pomylek jednej osoby. To nie jest dana wrazliwa —
      // wrazliwe jest haslo, ktorego tu nie ma i nie bedzie.
      metadata: { customerNumber, reason: "unknown_customer" },
      ip: context.ip,
      userAgent: context.userAgent,
    }),
  );
}

async function rehashIfNeeded(
  deps: AuthDeps,
  repos: Repositories,
  userId: Parameters<Repositories["users"]["setPasswordHash"]>[0],
  currentHash: string,
  plaintext: string,
): Promise<void> {
  if (!deps.hasher.needsRehash(currentHash)) {
    return;
  }

  // Podniesienie parametrow Argon2id nie uniewaznia starych hasel — te przeliczaja
  // sie same przy najblizszym poprawnym logowaniu, gdy haslo jest akurat w reku.
  await repos.users.setPasswordHash(userId, await deps.hasher.hash(plaintext));
}
