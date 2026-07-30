import type { NextRequest, NextResponse } from "next/server";
import { verifyAuditChain } from "@/application/audit/audit-chain";
import { auditDeps } from "@/infrastructure/container";
import { requestIdOf } from "@/http/request-context";
import { handle, ok } from "@/http/response";
import { requireSession } from "@/http/session";

export const dynamic = "force-dynamic";

/**
 * Weryfikacja lancucha skrotow logu audytu.
 *
 * Wymaga zalogowania, choc nie ujawnia niczyich danych — wynik to liczba i
 * ewentualny numer wpisu. Powod jest inny: przeliczenie calego lancucha jest
 * kosztowne, a endpoint kosztowny i otwarty dla wszystkich jest zaproszeniem.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = requestIdOf(request);

  return handle(requestId, async () => {
    await requireSession(request);

    const result = await verifyAuditChain(auditDeps);

    return ok(
      result.valid
        ? { valid: true, checked: result.checked }
        : {
            valid: false,
            checked: result.checked,
            brokenAtSeq: result.brokenAtSeq.toString(),
            reason: result.reason,
          },
    );
  });
}
