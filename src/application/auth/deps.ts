import type { Clock } from "@/domain/ports/clock";
import type { IdGenerator } from "@/domain/ports/id-generator";
import type {
  AccessTokenService,
  BreachedPasswordChecker,
  PasswordHasher,
  RandomTokenGenerator,
} from "@/domain/ports/auth";
import type { UnitOfWork } from "@/domain/ports/unit-of-work";

export interface AuthDeps {
  readonly uow: UnitOfWork;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly hasher: PasswordHasher;
  readonly breachedPasswords: BreachedPasswordChecker;
  readonly accessTokens: AccessTokenService;
  readonly refreshTokens: RandomTokenGenerator;
}

/**
 * Dane zadania potrzebne do audytu. Adres i przegladarka nie sluza do
 * podejmowania decyzji — sluza do tego, zeby uzytkownik na ekranie bezpieczenstwa
 * rozpoznal, ktore logowanie bylo jego.
 */
export interface RequestContext {
  readonly ip: string | null;
  readonly userAgent: string | null;
}

export const ANONYMOUS_CONTEXT: RequestContext = { ip: null, userAgent: null };

/** Zdarzenia uwierzytelniania trafiajace do logu audytu. */
export const AUTH_ACTIONS = {
  registered: "USER_REGISTERED",
  loginSuccess: "LOGIN_SUCCESS",
  loginFailed: "LOGIN_FAILED",
  loginLocked: "LOGIN_LOCKED_OUT",
  pinVerified: "PIN_VERIFIED",
  pinFailed: "PIN_FAILED",
  pinLocked: "PIN_HARD_LOCKED",
  pinUnlocked: "PIN_UNLOCKED",
  tokenRefreshed: "SESSION_REFRESHED",
  theftSuspected: "SESSION_THEFT_SUSPECTED",
  loggedOut: "LOGOUT",
  sessionRevoked: "SESSION_REVOKED",
  passwordChanged: "PASSWORD_CHANGED",
  breachCheckUnavailable: "HIBP_UNAVAILABLE",
  rateLimited: "RATE_LIMITED",
} as const;
