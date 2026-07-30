import type { AuthDeps, RequestContext } from "@/application/auth/deps";
import {
  ACCESS_TOKEN_DURATION_MS,
  REFRESH_TOKEN_DURATION_MS,
  type SessionClaims,
} from "@/domain/auth/session";
import type { UserId } from "@/domain/ids";
import type { Repositories } from "@/domain/ports/repositories";

export interface IssuedSession {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly accessTokenExpiresAt: Date;
  readonly refreshTokenExpiresAt: Date;
  readonly familyId: string;
}

interface IssueInput {
  readonly userId: UserId;
  /** Nowa rodzina przy logowaniu, istniejaca przy rotacji. */
  readonly familyId: string;
  readonly parentId: string | null;
  readonly elevatedUntil: Date | null;
  readonly context: RequestContext;
}

/**
 * Wydanie pary tokenow. Jedno miejsce, bo logowanie, odswiezenie i logowanie
 * demo musza dawac sesje o dokladnie tych samych wlasciwosciach — trzy kopie tej
 * funkcji rozjechalyby sie przy pierwszej zmianie czasu zycia tokena.
 */
export async function issueSession(
  deps: AuthDeps,
  repos: Repositories,
  input: IssueInput,
): Promise<IssuedSession> {
  const now = deps.clock.now();
  const accessTokenExpiresAt = new Date(
    now.getTime() + ACCESS_TOKEN_DURATION_MS,
  );
  const refreshTokenExpiresAt = new Date(
    now.getTime() + REFRESH_TOKEN_DURATION_MS,
  );

  const claims: SessionClaims = {
    userId: input.userId,
    familyId: input.familyId,
    issuedAt: now,
    expiresAt: accessTokenExpiresAt,
    elevatedUntil: input.elevatedUntil,
  };

  const refreshToken = deps.refreshTokens.generate();

  await repos.refreshTokens.issue({
    userId: input.userId,
    familyId: input.familyId,
    parentId: input.parentId,
    // Do bazy trafia wylacznie skrot. Kopia bazy nie daje dzialajacych sesji.
    fingerprint: deps.refreshTokens.fingerprint(refreshToken),
    expiresAt: refreshTokenExpiresAt,
    ip: input.context.ip,
    userAgent: input.context.userAgent,
  });

  return {
    accessToken: await deps.accessTokens.issue(claims),
    refreshToken,
    accessTokenExpiresAt,
    refreshTokenExpiresAt,
    familyId: input.familyId,
  };
}
