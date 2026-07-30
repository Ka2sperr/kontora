import {
  AUTH_ACTIONS,
  type AuthDeps,
  type RequestContext,
} from "@/application/auth/deps";
import type { SessionClaims } from "@/domain/auth/session";
import { assertActiveSession } from "@/domain/auth/session";
import { DomainError } from "@/domain/errors";

export interface SessionView {
  readonly id: string;
  readonly familyId: string;
  readonly current: boolean;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

export interface LoginHistoryEntry {
  readonly at: Date;
  readonly action: string;
  readonly successful: boolean;
  readonly ip: string | null;
  readonly userAgent: string | null;
}

export async function listSessions(
  deps: AuthDeps,
  claims: SessionClaims,
): Promise<readonly SessionView[]> {
  const now = deps.clock.now();

  assertActiveSession(claims, now);

  const records = await deps.uow.run((repos) =>
    repos.refreshTokens.activeSessions(claims.userId, now),
  );

  return records.map((record) => ({
    id: record.id,
    familyId: record.familyId,
    // Oznaczenie biezacego urzadzenia, zeby uzytkownik nie wylogowal sam siebie
    // w probie wylogowania kogos innego.
    current: record.familyId === claims.familyId,
    ip: record.ip,
    userAgent: record.userAgent,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
  }));
}

/**
 * Wylogowanie jednego urzadzenia. Przyjmuje identyfikator sesji z listy powyzej i
 * uniewaznia cala jego rodzine — pojedynczy token nie jest urzadzeniem, jest
 * ogniwem w lancuchu rotacji.
 */
export async function revokeSession(
  deps: AuthDeps,
  claims: SessionClaims,
  sessionId: string,
  context: RequestContext,
): Promise<{ readonly self: boolean }> {
  const now = deps.clock.now();

  assertActiveSession(claims, now);

  return deps.uow.run(async (repos) => {
    const sessions = await repos.refreshTokens.activeSessions(claims.userId, now);
    const target = sessions.find((session) => session.id === sessionId);

    // Sprawdzenie przez liste wlasnych sesji, a nie przez odczyt po
    // identyfikatorze: bez tego znajomosc cudzego identyfikatora pozwalalaby
    // wylogowac obca osobe.
    if (target === undefined) {
      throw new DomainError(
        "REFRESH_TOKEN_INVALID",
        "Nie znaleziono takiej sesji.",
      );
    }

    const self = target.familyId === claims.familyId;
    const revoked = await repos.refreshTokens.revokeFamily(target.familyId, now);

    await repos.audit.append({
      userId: claims.userId,
      action: AUTH_ACTIONS.sessionRevoked,
      entity: "session",
      entityId: target.familyId,
      metadata: { revokedTokens: revoked, self },
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return { self };
  });
}

export async function logout(
  deps: AuthDeps,
  claims: SessionClaims,
  context: RequestContext,
): Promise<void> {
  const now = deps.clock.now();

  await deps.uow.run(async (repos) => {
    const revoked = await repos.refreshTokens.revokeFamily(claims.familyId, now);

    await repos.audit.append({
      userId: claims.userId,
      action: AUTH_ACTIONS.loggedOut,
      entity: "session",
      entityId: claims.familyId,
      metadata: { revokedTokens: revoked },
      ip: context.ip,
      userAgent: context.userAgent,
    });
  });
}

const HISTORY_ACTIONS = [
  AUTH_ACTIONS.loginSuccess,
  AUTH_ACTIONS.loginFailed,
  AUTH_ACTIONS.loginLocked,
] as const;

/**
 * Historia logowan — udanych i nieudanych.
 *
 * Nieudane proby sa tu celowo. Uzytkownik, ktory widzi piec nieudanych logowan z
 * nieznanego adresu, wie, ze ktos probuje sie dostac na jego konto. To informacja,
 * ktorej nie da sie zastapic zadnym komunikatem systemu.
 */
export async function loginHistory(
  deps: AuthDeps,
  claims: SessionClaims,
  limit = 20,
): Promise<readonly LoginHistoryEntry[]> {
  assertActiveSession(claims, deps.clock.now());

  const entries = await deps.uow.run((repos) =>
    repos.audit.recentForUser({
      userId: claims.userId,
      actions: [...HISTORY_ACTIONS],
      limit,
    }),
  );

  return entries.map((entry) => ({
    at: entry.createdAt,
    action: entry.action,
    successful: entry.action === AUTH_ACTIONS.loginSuccess,
    ip: entry.ip,
    userAgent: entry.userAgent,
  }));
}
