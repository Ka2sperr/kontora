import type { NextRequest, NextResponse } from "next/server";
import { accountQueries } from "@/infrastructure/container";
import { requestIdOf } from "@/http/request-context";
import { handle, moneyDto, ok } from "@/http/response";
import { requireSession } from "@/http/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = requestIdOf(request);

  return handle(requestId, async () => {
    const claims = await requireSession(request);
    const accounts = await accountQueries.listForUser(claims.userId);

    return ok(
      accounts.map((account) => ({
        id: account.id,
        displayName: account.displayName,
        iban: account.iban,
        currency: account.currency,
        kind: account.kind,
        status: account.status,
        // Kwoty jako ciag znakow w jednostkach minor (sekcja 7). Liczba w JSON-ie
        // przeszlaby przez `Number` w przegladarce i zgubila grosze przy duzych
        // saldach — cicho, bo `JSON.parse` nie zglasza utraty precyzji.
        balance: moneyDto(account.balance),
        creditLimit:
          account.creditLimit === null ? null : moneyDto(account.creditLimit),
      })),
    );
  });
}
