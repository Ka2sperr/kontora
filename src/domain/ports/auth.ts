import type { SessionClaims } from "@/domain/auth/session";
import type { User } from "@/domain/auth/user";
import type { UserId } from "@/domain/ids";

/**
 * Hashowanie hasel i PIN-ow.
 *
 * `verify` przyjmuje hash jako pierwszy argument, bo parametry Argon2id sa
 * zakodowane w samym hashu — zmiana kosztu pamieciowego nie uniewaznia starych
 * hasel, weryfikuja sie swoimi parametrami.
 */
export interface PasswordHasher {
  hash(plaintext: string): Promise<string>;
  verify(hash: string, plaintext: string): Promise<boolean>;
  /** Czy hash powstal ze starszymi parametrami i warto go przeliczyc przy okazji logowania. */
  needsRehash(hash: string): boolean;
}

/**
 * Sprawdzenie hasla w bazie wyciekow (HIBP, model k-anonimowosci).
 *
 * Port zwraca liczbe wystapien, nie wartosc logiczna. Progiem decyduje domena, a
 * nie adapter — inaczej zmiana progu wymagalaby dotkniecia kodu, ktory rozmawia z
 * siecia.
 */
export interface BreachedPasswordChecker {
  /** Liczba wystapien hasla w wyciekach; 0 oznacza brak. */
  occurrences(plaintext: string): Promise<number>;
}

export interface AccessTokenService {
  issue(claims: SessionClaims): Promise<string>;
  /** Zwraca `null` dla tokena z niepoprawnym podpisem, uszkodzonego lub wygaslego. */
  verify(token: string): Promise<SessionClaims | null>;
}

export interface RandomTokenGenerator {
  /** Losowy token do przekazania klientowi, w postaci bezpiecznej dla URL-a. */
  generate(): string;
  /** Skrot do przechowania. Baza nigdy nie widzi wartosci jawnej. */
  fingerprint(token: string): string;
}

export interface RefreshTokenRecord {
  readonly id: string;
  readonly userId: UserId;
  readonly familyId: string;
  readonly parentId: string | null;
  readonly usedAt: Date | null;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly createdAt: Date;
}

export interface RefreshTokenRepository {
  findByFingerprint(fingerprint: string): Promise<RefreshTokenRecord | null>;

  issue(input: {
    readonly userId: UserId;
    readonly familyId: string;
    readonly parentId: string | null;
    readonly fingerprint: string;
    readonly expiresAt: Date;
    readonly ip: string | null;
    readonly userAgent: string | null;
  }): Promise<RefreshTokenRecord>;

  markUsed(id: string, at: Date): Promise<void>;

  /** Uniewaznia cala rodzine — reakcja na wykryte ponowne uzycie tokena. */
  revokeFamily(familyId: string, at: Date): Promise<number>;

  revokeById(id: string, at: Date): Promise<void>;

  /** Aktywne sesje uzytkownika: po jednym najswiezszym tokenie na rodzine. */
  activeSessions(userId: UserId, now: Date): Promise<readonly RefreshTokenRecord[]>;

  findFamilyHead(
    userId: UserId,
    familyId: string,
  ): Promise<RefreshTokenRecord | null>;
}

export interface UserRepository {
  findById(id: UserId): Promise<User | null>;
  findByCustomerNumber(customerNumber: string): Promise<User | null>;
  findDemoUser(): Promise<User | null>;

  create(input: {
    readonly customerNumber: string;
    readonly passwordHash: string;
    readonly pinHash: string | null;
    readonly firstName: string;
    readonly lastName: string;
    readonly email: string;
    readonly isDemo: boolean;
  }): Promise<User>;

  /**
   * Kolejna pozycja w sekwencji numerow klienta. Musi byc atomowa — dwie
   * rownolegle rejestracje nie moga dostac tej samej pozycji.
   */
  nextCustomerSequence(): Promise<number>;

  recordPasswordFailure(id: UserId): Promise<number>;
  clearPasswordFailures(id: UserId): Promise<void>;
  setPasswordLock(id: UserId, until: Date | null): Promise<void>;

  recordPinFailure(id: UserId): Promise<number>;
  clearPinFailures(id: UserId): Promise<void>;
  setPinLock(id: UserId, until: Date | null): Promise<void>;
  setPinHash(id: UserId, pinHash: string): Promise<void>;
  setPasswordHash(id: UserId, passwordHash: string): Promise<void>;
}

/**
 * Ograniczanie czestotliwosci prob.
 *
 * Nie ma tu okna czasowego ani limitu — te sa parametrami wywolania, bo roznia
 * sie miedzy operacjami. Port odpowiada tylko na pytanie "ile razy juz probowano".
 */
export interface AttemptCounter {
  count(input: {
    readonly action: string;
    readonly subject: string;
    readonly since: Date;
  }): Promise<number>;
}
