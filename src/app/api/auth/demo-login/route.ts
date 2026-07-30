import type { NextRequest, NextResponse } from "next/server";
import { demoLogin } from "@/application/auth/demo-login";
import { authDeps } from "@/infrastructure/container";
import { contextOf, requestIdOf } from "@/http/request-context";
import { handle, ok } from "@/http/response";
import { attachSessionCookies } from "@/http/session";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = requestIdOf(request);

  return handle(requestId, async () => {
    const session = await demoLogin(authDeps, contextOf(request));

    // Dane logowania wracaja jawnie, zeby interfejs mogl je pokazac i wypelnic
    // formularz. Rekruter ma zobaczyc pelny przeplyw uwierzytelniania, a nie
    // ominac go — dlatego pokazujemy dane zamiast je ukrywac.
    return attachSessionCookies(
      ok({
        user: session.user,
        credentials: session.credentials,
        expiresAt: session.accessTokenExpiresAt.toISOString(),
      }),
      session,
    );
  });
}
