import { createHash } from "node:crypto";
import type { BreachedPasswordChecker } from "@/domain/ports/auth";

const HIBP_RANGE_URL = "https://api.pwnedpasswords.com/range";

/**
 * Sprawdzenie hasla w bazie Have I Been Pwned w modelu k-anonimowosci.
 *
 * Wysylanych jest **piec pierwszych znakow** skrotu SHA-1 hasla. Serwer odsyla
 * wszystkie skroty zaczynajace sie od tego prefiksu (zwykle kilkaset) i to my
 * szukamy w nich swojego. HIBP nie dowiaduje sie, o ktore haslo pytamy, ani nawet
 * czy je znalezlismy.
 *
 * SHA-1 nie jest tu wyborem kryptograficznym — to format, w ktorym HIBP publikuje
 * swoje dane. Haslo w naszej bazie jest chronione Argon2id.
 */
export class HibpBreachedPasswordChecker implements BreachedPasswordChecker {
  constructor(
    private readonly enabled: boolean,
    private readonly timeoutMs: number,
  ) {}

  async occurrences(plaintext: string): Promise<number> {
    if (!this.enabled) {
      return 0;
    }

    const digest = createHash("sha1")
      .update(plaintext, "utf8")
      .digest("hex")
      .toUpperCase();
    const prefix = digest.slice(0, 5);
    const suffix = digest.slice(5);

    try {
      const response = await fetch(`${HIBP_RANGE_URL}/${prefix}`, {
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: {
          // Wymagane przez HIBP, zeby odpowiedz zawierala takze sztuczne
          // wypelniacze — bez tego sam rozmiar odpowiedzi niesie informacje.
          "Add-Padding": "true",
          "User-Agent": "kontora-demo",
        },
      });

      if (!response.ok) {
        return 0;
      }

      const body = await response.text();

      for (const line of body.split("\n")) {
        const [candidate, count] = line.trim().split(":");

        if (candidate === suffix) {
          return Number(count ?? 0);
        }
      }

      return 0;
    } catch {
      // Degradacja lagodna: niedostepnosc cudzego serwera nie moze blokowac
      // zakladania konta. Wpuszczamy haslo i odnotowujemy fakt w logu audytu
      // (HIBP_UNAVAILABLE), zeby nie bylo to ciche.
      //
      // Odwrotny wybor — odrzucanie rejestracji przy awarii HIBP — zamienialby
      // czyjas awarie w nasza niedostepnosc.
      return 0;
    }
  }
}
