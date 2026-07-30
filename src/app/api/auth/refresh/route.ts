import type { NextRequest, NextResponse } from "next/server";
import { refreshSession } from "@/application/auth/refresh";
import { DomainError } from "@/domain/errors";
import { authDeps } from "@/infrastructure/container";
import { contextOf, requestIdOf } from "@/http/request-context";
import { failure, handle, ok } from "@/http/response";
import {
  attachSessionCookies,
  clearSessionCookies,
  refreshTokenOf,
} from "@/http/session";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = requestIdOf(request);

  return handle(requestId, async () => {
    const token = refreshTokenOf(request);

    if (token === null) {
      throw new DomainError(
        "REFRESH_TOKEN_INVALID",
        "Brak tokena odswiezajacego. Zaloguj sie ponownie.",
      );
    }

    try {
      const session = await refreshSession(authDeps, token, contextOf(request));

      return attachSessionCookies(
        ok({ expiresAt: session.accessTokenExpiresAt.toISOString() }),
        session,
      );
    } catch (error) {
      // Odrzucone odswiezenie czysci ciasteczka. Martwy token zostawiony w
      // przegladarce daje petle: klient probuje odswiezyc, dostaje 401, probuje
      // znowu — i nie ma jak z niej wyjsc bez recznego czyszczenia danych.
      if (error instanceof DomainError) {
        return clearSessionCookies(failure(error));
      }

      throw error;
    }
  });
}
