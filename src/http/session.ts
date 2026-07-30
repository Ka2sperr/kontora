import type { NextRequest, NextResponse } from "next/server";
import type { IssuedSession } from "@/application/auth/session-tokens";
import type { ElevatedOperation, SessionClaims } from "@/domain/auth/session";
import { assertElevated } from "@/domain/auth/session";
import { DomainError } from "@/domain/errors";
import { accessTokenService } from "@/infrastructure/container";
import { env } from "@/infrastructure/config/env";

export const ACCESS_COOKIE = "kontora_access";
export const REFRESH_COOKIE = "kontora_refresh";

/**
 * Tokeny mieszkaja w ciasteczkach `httpOnly`, a nie w `localStorage`.
 *
 * `localStorage` jest czytelny dla kazdego skryptu na stronie, wiec pojedynczy XSS
 * — wlasny albo w zaleznosci — oddaje sesje. Ciasteczko `httpOnly` jest dla
 * JavaScriptu niewidoczne, wiec ten sam XSS moze wykonac zadanie w imieniu
 * uzytkownika, ale nie moze wykrasc sesji i uzywac jej pozniej z wlasnej maszyny.
 *
 * `SameSite=Strict` odcina CSRF: przegladarka nie dolaczy ciasteczka do zadania
 * zaczetego na cudzej stronie.
 */
const BASE_COOKIE = {
  httpOnly: true,
  sameSite: "strict",
  path: "/",
  // Bez HTTPS ciasteczko z `secure` nie zostaloby w ogole zapisane, wiec lokalny
  // development przestalby dzialac. Poza `development` flaga jest zawsze wlaczona.
  secure: env.NODE_ENV !== "development",
} as const;

export function attachSessionCookies(
  response: NextResponse,
  session: IssuedSession,
): NextResponse {
  response.cookies.set({
    ...BASE_COOKIE,
    name: ACCESS_COOKIE,
    value: session.accessToken,
    expires: session.accessTokenExpiresAt,
  });

  response.cookies.set({
    ...BASE_COOKIE,
    name: REFRESH_COOKIE,
    value: session.refreshToken,
    expires: session.refreshTokenExpiresAt,
    // Token odswiezajacy jest wysylany wylacznie pod endpointy sesji. Nie ma
    // powodu, zeby jechal z kazdym zapytaniem o saldo.
    path: "/api/auth",
  });

  return response;
}

export function clearSessionCookies(response: NextResponse): NextResponse {
  response.cookies.set({ ...BASE_COOKIE, name: ACCESS_COOKIE, value: "", maxAge: 0 });
  response.cookies.set({
    ...BASE_COOKIE,
    name: REFRESH_COOKIE,
    value: "",
    path: "/api/auth",
    maxAge: 0,
  });

  return response;
}

export function refreshTokenOf(request: NextRequest): string | null {
  return request.cookies.get(REFRESH_COOKIE)?.value ?? null;
}

/** Sesja zadania albo `null`, gdy zadania nie da sie przypisac do nikogo. */
export async function sessionOf(
  request: NextRequest,
): Promise<SessionClaims | null> {
  const token = request.cookies.get(ACCESS_COOKIE)?.value;

  if (token === undefined || token.length === 0) {
    return null;
  }

  return accessTokenService.verify(token);
}

export async function requireSession(
  request: NextRequest,
): Promise<SessionClaims> {
  const claims = await sessionOf(request);

  if (claims === null) {
    throw new DomainError("SESSION_EXPIRED", "Zaloguj sie, zeby kontynuowac.");
  }

  return claims;
}

/**
 * Sesja podniesiona PIN-em. Brama dla wszystkich operacji z sekcji 6.1 — jedno
 * miejsce, zamiast sprawdzenia powtarzanego w kazdym handlerze, gdzie predzej czy
 * pozniej ktores zostanie pominiete.
 */
export async function requireElevatedSession(
  request: NextRequest,
  operation: ElevatedOperation,
  now: Date,
): Promise<SessionClaims> {
  const claims = await requireSession(request);

  assertElevated(claims, now, operation);

  return claims;
}
