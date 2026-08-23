import type { NextRequest, NextResponse } from "next/server";
import { DomainError } from "@/domain/errors";
import { accountId } from "@/domain/ids";
import { accountQueries } from "@/infrastructure/container";
import { requestIdOf } from "@/http/request-context";
import { handle, moneyDto, ok } from "@/http/response";
import { requireSession } from "@/http/session";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const requestId = requestIdOf(request);

  return handle(requestId, async () => {
    const claims = await requireSession(request);
    const { id } = await context.params;

    // Zapytanie samo filtruje po wlascicielu, wiec cudze konto zwraca `null`, a
    // nie dane. Odpowiedz jest taka sama jak dla konta nieistniejacego —
    // rozroznienie potwierdzaloby istnienie zasobu, o ktory ktos pyta na oslep.
    const account = await accountQueries.findForUser(claims.userId, accountId(id));

    if (account === null) {
      throw new DomainError("ACCOUNT_NOT_FOUND", "Nie znaleziono takiego konta.");
    }

    return ok({
      id: account.id,
      displayName: account.displayName,
      iban: account.iban,
      currency: account.currency,
      kind: account.kind,
      status: account.status,
      balance: moneyDto(account.balance),
      creditLimit:
        account.creditLimit === null ? null : moneyDto(account.creditLimit),
    });
  });
}
