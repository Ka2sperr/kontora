import type { NextRequest, NextResponse } from "next/server";
import { logout } from "@/application/auth/sessions";
import { authDeps } from "@/infrastructure/container";
import { contextOf, requestIdOf } from "@/http/request-context";
import { handle, ok } from "@/http/response";
import { clearSessionCookies, sessionOf } from "@/http/session";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = requestIdOf(request);

  return handle(requestId, async () => {
    const claims = await sessionOf(request);

    // Wylogowanie bez waznej sesji konczy sie sukcesem. Uzytkownik chce byc
    // wylogowany i po tym zadaniu jest — zwrocenie bledu zmuszaloby interfejs do
    // obslugi przypadku, ktory z jego perspektywy niczym sie nie rozni.
    if (claims !== null) {
      await logout(authDeps, claims, contextOf(request));
    }

    return clearSessionCookies(ok({ loggedOut: true }));
  });
}
