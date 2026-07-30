import type { NextRequest, NextResponse } from "next/server";
import { revokeSession } from "@/application/auth/sessions";
import { authDeps } from "@/infrastructure/container";
import { contextOf, requestIdOf } from "@/http/request-context";
import { handle, ok } from "@/http/response";
import { clearSessionCookies, requireSession } from "@/http/session";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const requestId = requestIdOf(request);

  return handle(requestId, async () => {
    const claims = await requireSession(request);
    const { id } = await context.params;

    const { self } = await revokeSession(authDeps, claims, id, contextOf(request));

    const response = ok({ revoked: true, self });

    // Jesli uzytkownik wylogowal wlasne urzadzenie, jego ciasteczka wskazuja na
    // uniewazniona rodzine. Wyczyszczenie ich od razu oszczedza mu jednego
    // niezrozumialego bledu przy nastepnym klikniecu.
    return self ? clearSessionCookies(response) : response;
  });
}
