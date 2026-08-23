import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { DomainError } from "@/domain/errors";
import { accountId } from "@/domain/ids";
import { accountQueries } from "@/infrastructure/container";
import { requestIdOf } from "@/http/request-context";
import { handle, moneyDto, ok } from "@/http/response";
import { requireSession } from "@/http/session";
import { ValidationError } from "@/http/validation";

export const dynamic = "force-dynamic";

/**
 * Filtry historii z sekcji 7.
 *
 * Kwoty przychodza jako ciag cyfr w jednostkach minor, nie jako liczba
 * zmiennoprzecinkowa. `?min=100.50` wymagaloby parsowania ulamka w warstwie HTTP,
 * czyli dokladnie tej arytmetyki, ktorej zabrania zasada nr 1.
 */
const querySchema = z.object({
  cursor: z.string().regex(/^\d+$/).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  category: z.string().max(64).optional(),
  min: z.string().regex(/^\d+$/).optional(),
  max: z.string().regex(/^\d+$/).optional(),
  q: z.string().max(128).optional(),
});

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const requestId = requestIdOf(request);

  return handle(requestId, async () => {
    const claims = await requireSession(request);
    const { id } = await context.params;

    const parsed = querySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams),
    );

    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues.map((issue) => ({
          path: issue.path.join(".") || "(query)",
          message: issue.message,
        })),
      );
    }

    const account = await accountQueries.findForUser(claims.userId, accountId(id));

    if (account === null) {
      throw new DomainError("ACCOUNT_NOT_FOUND", "Nie znaleziono takiego konta.");
    }

    const filters = parsed.data;

    const page = await accountQueries.listTransactions({
      accountId: account.id,
      limit: filters.limit,
      cursor: filters.cursor,
      from: filters.from === undefined ? undefined : new Date(filters.from),
      to: filters.to === undefined ? undefined : new Date(filters.to),
      category: filters.category,
      minMinor: filters.min === undefined ? undefined : BigInt(filters.min),
      maxMinor: filters.max === undefined ? undefined : BigInt(filters.max),
      query: filters.q,
    });

    return ok({
      items: page.items.map((item) => ({
        id: item.id,
        kind: item.kind,
        title: item.title,
        counterpartyName: item.counterpartyName,
        counterpartyIban: item.counterpartyIban,
        category: item.category,
        merchant: item.merchant,
        bookedAt: item.bookedAt.toISOString(),
        amount: moneyDto(item.amount),
        // Zapisy ksiegowe jada razem z pozycja, nie osobnym zadaniem. To one sa
        // elementem pokazowym (sekcja 9 punkt 3), wiec rozwiniecie wiersza ma byc
        // natychmiastowe, a nie oznaczac kolejna podroz do serwera.
        entries: item.entries.map((entry) => ({
          accountId: entry.accountId,
          accountName: entry.accountName,
          amount: moneyDto(entry.amount),
        })),
      })),
      nextCursor: page.nextCursor,
    });
  });
}
