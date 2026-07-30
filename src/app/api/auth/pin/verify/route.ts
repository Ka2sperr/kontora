import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyPin } from "@/application/auth/pin";
import { authDeps } from "@/infrastructure/container";
import { contextOf, requestIdOf } from "@/http/request-context";
import { handle, ok } from "@/http/response";
import { ACCESS_COOKIE, requireSession } from "@/http/session";
import { env } from "@/infrastructure/config/env";
import { parseBody } from "@/http/validation";

export const dynamic = "force-dynamic";

const schema = z.object({
  pin: z.string().regex(/^\d{4,6}$/, "PIN ma od 4 do 6 cyfr."),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = requestIdOf(request);

  return handle(requestId, async () => {
    const claims = await requireSession(request);
    const body = await parseBody(request, schema);

    const result = await verifyPin(
      authDeps,
      claims,
      body.pin,
      contextOf(request),
    );

    const response = ok({
      elevatedUntil: result.elevatedUntil.toISOString(),
      elevatedForSeconds: Math.round(
        (result.elevatedUntil.getTime() - Date.now()) / 1000,
      ),
    });

    response.cookies.set({
      name: ACCESS_COOKIE,
      value: result.accessToken,
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      secure: env.NODE_ENV !== "development",
      expires: result.accessTokenExpiresAt,
    });

    return response;
  });
}
