import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { login } from "@/application/auth/login";
import { authDeps } from "@/infrastructure/container";
import { contextOf, requestIdOf } from "@/http/request-context";
import { handle, ok } from "@/http/response";
import { attachSessionCookies } from "@/http/session";
import { parseBody } from "@/http/validation";

export const dynamic = "force-dynamic";

const schema = z.object({
  customerNumber: z.string().regex(/^\d{8}$/, "Numer klienta ma 8 cyfr."),
  password: z.string().min(1).max(256),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = requestIdOf(request);

  return handle(requestId, async () => {
    const body = await parseBody(request, schema);
    const session = await login(authDeps, body, contextOf(request));

    // Tokeny ida wylacznie w ciasteczkach httpOnly. W ciele odpowiedzi jest tylko
    // to, co interfejs musi pokazac — token w JSON-ie ladowalby w localStorage.
    return attachSessionCookies(
      ok({
        user: session.user,
        expiresAt: session.accessTokenExpiresAt.toISOString(),
      }),
      session,
    );
  });
}
