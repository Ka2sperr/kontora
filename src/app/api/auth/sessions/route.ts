import type { NextRequest, NextResponse } from "next/server";
import { listSessions } from "@/application/auth/sessions";
import { authDeps } from "@/infrastructure/container";
import { requestIdOf } from "@/http/request-context";
import { handle, ok } from "@/http/response";
import { requireSession } from "@/http/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = requestIdOf(request);

  return handle(requestId, async () => {
    const claims = await requireSession(request);
    const sessions = await listSessions(authDeps, claims);

    return ok(
      sessions.map((session) => ({
        id: session.id,
        current: session.current,
        ip: session.ip,
        userAgent: session.userAgent,
        createdAt: session.createdAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
      })),
    );
  });
}
