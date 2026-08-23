import { cookies } from "next/headers";
import type { SessionClaims } from "@/domain/auth/session";
import { ACCESS_COOKIE } from "@/http/session";
import { accessTokenService } from "@/infrastructure/container";

/**
 * Sesja komponentu serwerowego.
 *
 * Osobno od `requireSession` z warstwy HTTP, bo tam zrodlem jest `NextRequest`, a
 * tutaj `cookies()`. Wspolne jest to, co istotne: weryfikacja podpisu i czasu
 * wygasniecia idzie przez ten sam serwis tokenow.
 *
 * Zwraca `null` zamiast rzucac. Strona ma wtedy przekierowac na logowanie, a nie
 * pokazac blad — brak sesji jest normalnym stanem, nie awaria.
 */
export async function wymagajSesji(): Promise<SessionClaims | null> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;

  if (token === undefined || token.length === 0) {
    return null;
  }

  return accessTokenService.verify(token);
}
