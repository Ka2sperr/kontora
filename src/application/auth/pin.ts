import {
  AUTH_ACTIONS,
  type AuthDeps,
  type RequestContext,
} from "@/application/auth/deps";
import {
  PIN_ATTEMPTS_BEFORE_HARD_LOCK,
  PIN_HARD_LOCK_UNTIL,
  isPinHardLocked,
  shouldHardLockPin,
} from "@/domain/auth/lockout";
import { assertPinShape } from "@/domain/auth/password";
import {
  ELEVATION_DURATION_MS,
  type SessionClaims,
  assertActiveSession,
} from "@/domain/auth/session";
import { DomainError } from "@/domain/errors";

export interface VerifyPinResult {
  readonly accessToken: string;
  readonly elevatedUntil: Date;
  readonly accessTokenExpiresAt: Date;
}

/**
 * Podniesienie sesji PIN-em (ADR-002).
 *
 * PIN nie loguje. Dziala wylacznie na sesji juz uwierzytelnionej haslem i podnosi
 * ja na piec minut do poziomu wymaganego przez operacje pieniezne. Rozroznienie
 * nie jest kosmetyczne: PIN o czterech cyfrach ma dziesiec tysiecy kombinacji, wiec
 * jako czynnik logowania bylby najslabszym ogniwem calego systemu.
 *
 * Nowy token dostepu zachowuje pierwotny czas wygasniecia sesji. Podnoszenie PIN-em
 * nie moze przedluzac zycia sesji, bo wtedy wystarczyloby wpisywac PIN co pare minut,
 * zeby nie wylogowac sie nigdy.
 */
export async function verifyPin(
  deps: AuthDeps,
  claims: SessionClaims,
  pin: string,
  context: RequestContext,
): Promise<VerifyPinResult> {
  const now = deps.clock.now();

  assertActiveSession(claims, now);
  assertPinShape(pin);

  const user = await deps.uow.run((repos) => repos.users.findById(claims.userId));

  if (user === null) {
    throw new DomainError("SESSION_EXPIRED", "Sesja dotyczy nieistniejacego konta.");
  }

  if (user.pinHash === null) {
    throw new DomainError(
      "PIN_NOT_SET",
      "To konto nie ma jeszcze ustawionego PIN-u.",
    );
  }

  if (isPinHardLocked(user.pinLockedUntil)) {
    throw pinLocked();
  }

  const pinOk = await deps.hasher.verify(user.pinHash, pin);

  if (!pinOk) {
    const locked = await deps.uow.run(async (repos) => {
      const failures = await repos.users.recordPinFailure(user.id);
      const hardLock = shouldHardLockPin(failures);

      if (hardLock) {
        await repos.users.setPinLock(user.id, PIN_HARD_LOCK_UNTIL);
      }

      await repos.audit.append({
        userId: user.id,
        action: hardLock ? AUTH_ACTIONS.pinLocked : AUTH_ACTIONS.pinFailed,
        entity: "user",
        entityId: user.id,
        // Ani PIN-u, ani jego fragmentu, ani dlugosci. Liczba prob wystarcza do
        // wykrycia ataku i nie zdradza niczego o samej wartosci.
        metadata: { failures, attemptsAllowed: PIN_ATTEMPTS_BEFORE_HARD_LOCK },
        ip: context.ip,
        userAgent: context.userAgent,
      });

      return hardLock;
    });

    throw locked
      ? pinLocked()
      : new DomainError("INVALID_CREDENTIALS", "Niepoprawny PIN.");
  }

  const elevatedUntil = new Date(now.getTime() + ELEVATION_DURATION_MS);

  const accessToken = await deps.accessTokens.issue({
    ...claims,
    elevatedUntil,
  });

  await deps.uow.run(async (repos) => {
    await repos.users.clearPinFailures(user.id);

    await repos.audit.append({
      userId: user.id,
      action: AUTH_ACTIONS.pinVerified,
      entity: "session",
      entityId: claims.familyId,
      metadata: { elevatedForSeconds: ELEVATION_DURATION_MS / 1000 },
      ip: context.ip,
      userAgent: context.userAgent,
    });
  });

  return {
    accessToken,
    elevatedUntil,
    accessTokenExpiresAt: claims.expiresAt,
  };
}

function pinLocked(): DomainError {
  return new DomainError(
    "PIN_LOCKED",
    "PIN zostal zablokowany po trzech bledach. Zaloguj sie ponownie haslem, zeby go odblokowac.",
  );
}

/** Ustawienie lub zmiana PIN-u. Wymaga sesji podniesionej albo swiezego logowania. */
export async function setPin(
  deps: AuthDeps,
  claims: SessionClaims,
  pin: string,
  context: RequestContext,
): Promise<void> {
  assertActiveSession(claims, deps.clock.now());
  assertPinShape(pin);

  const pinHash = await deps.hasher.hash(pin);

  await deps.uow.run(async (repos) => {
    await repos.users.setPinHash(claims.userId, pinHash);
    await repos.users.clearPinFailures(claims.userId);

    await repos.audit.append({
      userId: claims.userId,
      action: AUTH_ACTIONS.pinUnlocked,
      entity: "user",
      entityId: claims.userId,
      metadata: { reason: "pin_set" },
      ip: context.ip,
      userAgent: context.userAgent,
    });
  });
}
