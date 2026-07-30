import type {
  AuditEntryDraft,
  ChainVerification,
} from "@/domain/audit/audit-log";
import { verifyChain } from "@/domain/audit/audit-log";
import type { Hasher } from "@/domain/ports/hasher";
import type { UnitOfWork } from "@/domain/ports/unit-of-work";

export interface AuditDeps {
  readonly uow: UnitOfWork;
  readonly hasher: Hasher;
}

/**
 * Dopisanie wpisu do logu audytu w osobnej transakcji.
 *
 * Zdarzenia towarzyszace ksiegowaniu (kto zlecil przelew, z jakiego adresu)
 * dopisuje sie wewnatrz transakcji ksiegowania, przez `repos.audit`. Ta funkcja
 * obsluguje zdarzenia, ktore z ksiegowaniem nie maja zwiazku: logowania, proby
 * PIN-u, podglad numeru karty.
 */
export function appendAuditEntry(
  deps: AuditDeps,
  draft: AuditEntryDraft,
): Promise<{ readonly seq: bigint; readonly hash: string }> {
  return deps.uow.run(async (repos) => {
    const entry = await repos.audit.append(draft);

    return { seq: entry.seq, hash: entry.hash };
  });
}

/**
 * Przelicza caly lancuch od poczatku.
 *
 * Odczyt calego logu jest kosztowny i taki zostaje: weryfikacja ma odpowiadac na
 * pytanie "czy ktos grzebal w logu", a odpowiedz oparta na probce nie odpowiada na
 * to pytanie.
 */
export function verifyAuditChain(deps: AuditDeps): Promise<ChainVerification> {
  return deps.uow.run(async (repos) => {
    const entries = await repos.audit.all();

    return verifyChain(deps.hasher, entries);
  });
}
