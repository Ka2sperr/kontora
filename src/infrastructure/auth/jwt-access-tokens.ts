import { SignJWT, jwtVerify } from "jose";
import type { SessionClaims } from "@/domain/auth/session";
import { type UserId, userId } from "@/domain/ids";
import type { AccessTokenService } from "@/domain/ports/auth";
import type { Clock } from "@/domain/ports/clock";

/**
 * Token dostepu jako JWT podpisany HS256.
 *
 * Podpis symetryczny, bo wystawca i weryfikator to ten sam proces. RS256 mialby
 * sens, gdyby token weryfikowala inna usluga, ktorej nie chcemy dawac klucza
 * podpisujacego — tu takiej nie ma, a asymetria kosztowalaby zarzadzanie para
 * kluczy bez zysku.
 *
 * Token nie jest szyfrowany, tylko podpisany: jego tresc jest jawna dla kazdego,
 * kto go ma. Dlatego nie ma w nim niczego poza identyfikatorem uzytkownika,
 * rodzina sesji i czasami — zadnego imienia, salda ani numeru karty.
 */

const ISSUER = "kontora";
const AUDIENCE = "kontora-web";

interface TokenPayload {
  readonly fam: string;
  readonly elv?: number;
}

export class JwtAccessTokenService implements AccessTokenService {
  private readonly key: Uint8Array;

  /**
   * Zegar jest wstrzykiwany, a nie brany z systemu.
   *
   * `jwtVerify` domyslnie porownuje `exp` z czasem systemowym, wiec token wydany
   * przez sterowany zegar testu bylby dla niego wygasly albo jeszcze niewydany —
   * zaleznie od tego, o ktorej uruchomiono testy. Sprawdzenie czasu i wydawanie
   * tokena musza patrzec na ten sam zegar.
   */
  constructor(
    secret: string,
    private readonly clock: Clock,
  ) {
    this.key = new TextEncoder().encode(secret);
  }

  async issue(claims: SessionClaims): Promise<string> {
    const payload: TokenPayload = {
      fam: claims.familyId,
      ...(claims.elevatedUntil === null
        ? {}
        : { elv: Math.floor(claims.elevatedUntil.getTime() / 1000) }),
    };

    return new SignJWT({ ...payload })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(claims.userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt(Math.floor(claims.issuedAt.getTime() / 1000))
      .setExpirationTime(Math.floor(claims.expiresAt.getTime() / 1000))
      .sign(this.key);
  }

  async verify(token: string): Promise<SessionClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: ISSUER,
        audience: AUDIENCE,
        // Lista dozwolonych algorytmow jest obowiazkowa. Bez niej token z
        // naglowkiem `alg: none` albo podmieniona krzywa bywa akceptowany —
        // klasyczna rodzina bledow w bibliotekach JWT.
        algorithms: ["HS256"],
        currentDate: this.clock.now(),
      });

      const subject = payload.sub;
      const family = payload["fam"];

      if (typeof subject !== "string" || typeof family !== "string") {
        return null;
      }

      if (typeof payload.iat !== "number" || typeof payload.exp !== "number") {
        return null;
      }

      const elevated = payload["elv"];

      return {
        userId: userId(subject) as UserId,
        familyId: family,
        issuedAt: new Date(payload.iat * 1000),
        expiresAt: new Date(payload.exp * 1000),
        elevatedUntil:
          typeof elevated === "number" ? new Date(elevated * 1000) : null,
      };
    } catch {
      // Zly podpis, wygasly token, uszkodzona tresc — z perspektywy wolajacego to
      // jedno i to samo: tego tokena nie da sie uznac. Rozroznianie powodow w
      // odpowiedzi HTTP podpowiadaloby atakujacemu, ktora czesc juz mu sie udala.
      return null;
    }
  }
}
