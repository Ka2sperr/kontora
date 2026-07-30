import type { NextRequest, NextResponse } from "next/server";
import { loginHistory } from "@/application/auth/sessions";
import { authDeps } from "@/infrastructure/container";
import { requestIdOf } from "@/http/request-context";
import { handle, ok } from "@/http/response";
import { requireSession } from "@/http/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = requestIdOf(request);

  return handle(requestId, async () => {
    const claims = await requireSession(request);
    const history = await loginHistory(authDeps, claims);

    return ok(
      history.map((entry) => ({
        at: entry.at.toISOString(),
        action: entry.action,
        successful: entry.successful,
        ip: entry.ip,
        userAgent: entry.userAgent,
      })),
    );
  });
}
