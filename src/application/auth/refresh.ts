import {
  AUTH_ACTIONS,
  type AuthDeps,
  type RequestContext,
} from "@/application/auth/deps";
import {
  type IssuedSession,
  issueSession,
} from "@/application/auth/session-tokens";
import { DomainError } from "@/domain/errors";
import type { RefreshTokenRecord } from "@/domain/ports/auth";

type RefreshOutcome =
  | { readonly kind: "rotated"; readonly session: IssuedSession }
  | { readonly kind: "theft"; readonly record: RefreshTokenRecord };

/**
 * Rotacja tokena odswiezajacego z wykrywaniem ponownego uzycia.
 *
 * Kazde uzycie tokena go zuzywa i wydaje nastepny w tej samej rodzinie. Token
 * uzyty dwa razy oznacza, ze istnieja dwie kopie — a skoro uczciwy klient zawsze
 * ma najnowsza, to znaczy, ze ktos ma stara. Nie da sie stwierdzic, ktore z dwoch
 * zadan jest tym uczciwym, wiec uniewazniana jest **cala rodzina**: napastnik traci
 * dostep, wlasciciel loguje sie ponownie i widzi wyjasnienie.
 *
 * Alternatywa — uniewaznienie tylko podejrzanego tokena — zostawialaby napastnika
 * z dzialajaca sesja w polowie przypadkow.
 */
export async function refreshSession(
  deps: AuthDeps,
  refreshToken: string,
  context: RequestContext,
): Promise<IssuedSession> {
  const now = deps.clock.now();
  const fingerprint = deps.refreshTokens.fingerprint(refreshToken);

  const outcome = await deps.uow.run<RefreshOutcome>(async (repos) => {
    const record = await repos.refreshTokens.findByFingerprint(fingerprint);

    if (record === null) {
      throw invalidToken();
    }

    // Wykrycie kradziezy tylko sygnalizujemy — reakcja idzie osobna transakcja.
    // Uniewaznienie rodziny w TEJ transakcji, a potem rzucenie wyjatku, wycofaloby
    // je razem z nia: napastnik dostalby blad, ale jego pozostale tokeny dzialalyby
    // dalej. Znalazl to test sprawdzajacy, ze po wykryciu kradziezy pada takze
    // token wydany chwile wczesniej.
    if (record.usedAt !== null) {
      return { kind: "theft", record };
    }

    if (record.revokedAt !== null || record.expiresAt.getTime() <= now.getTime()) {
      throw invalidToken();
    }

    await repos.refreshTokens.markUsed(record.id, now);

    // Nowy token dostepu nie dziedziczy podniesienia. Podniesienie zyje piec minut,
    // token dostepu pietnascie — w momencie odswiezenia jest wiec i tak po nim.
    // Jawne `null` zamiast przepisywania wartosci usuwa cala klase pomylek.
    const session = await issueSession(deps, repos, {
      userId: record.userId,
      familyId: record.familyId,
      parentId: record.id,
      elevatedUntil: null,
      context,
    });

    await repos.audit.append({
      userId: record.userId,
      action: AUTH_ACTIONS.tokenRefreshed,
      entity: "session",
      entityId: record.familyId,
      metadata: { parentTokenId: record.id },
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return { kind: "rotated", session };
  });

  if (outcome.kind === "rotated") {
    return outcome.session;
  }

  const { record } = outcome;

  await deps.uow.run(async (repos) => {
    const revoked = await repos.refreshTokens.revokeFamily(record.familyId, now);

    await repos.audit.append({
      userId: record.userId,
      action: AUTH_ACTIONS.theftSuspected,
      entity: "session",
      entityId: record.familyId,
      metadata: {
        revokedTokens: revoked,
        originallyUsedAt: record.usedAt?.toISOString() ?? null,
      },
      ip: context.ip,
      userAgent: context.userAgent,
    });
  });

  throw new DomainError(
    "SESSION_THEFT_SUSPECTED",
    "Ten token byl juz uzyty. Ze wzgledu na bezpieczenstwo wylogowalismy wszystkie urzadzenia. Zaloguj sie ponownie.",
  );
}

function invalidToken(): DomainError {
  return new DomainError(
    "REFRESH_TOKEN_INVALID",
    "Sesja wygasla lub zostala zakonczona. Zaloguj sie ponownie.",
  );
}
