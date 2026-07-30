import { asc, desc, sql } from "drizzle-orm";
import {
  type AuditEntry,
  type AuditEntryDraft,
  GENESIS_HASH,
  computeAuditHash,
} from "@/domain/audit/audit-log";
import { type UserId, userId } from "@/domain/ids";
import type { AuditLogRepository } from "@/domain/ports/audit-log-repository";
import type { Hasher } from "@/domain/ports/hasher";
import type { Clock } from "@/domain/ports/clock";
import type { DbExecutor } from "@/infrastructure/db/executor";
import { auditLog } from "@/infrastructure/db/schema";

/**
 * Stala blokady doradczej. Dowolna, byle ta sama we wszystkich procesach —
 * wartosc jest tylko nazwa kolejki.
 */
const AUDIT_CHAIN_LOCK = 0x4b4f_4e54n;

interface AuditRow {
  seq: bigint;
  userId: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  metadata: unknown;
  ip: string | null;
  userAgent: string | null;
  prevHash: string;
  hash: string;
  createdAt: Date;
}

function toEntry(row: AuditRow): AuditEntry {
  return {
    seq: row.seq,
    userId: row.userId === null ? null : (userId(row.userId) as UserId),
    action: row.action,
    entity: row.entity,
    entityId: row.entityId,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    ip: row.ip,
    userAgent: row.userAgent,
    prevHash: row.prevHash.trim(),
    hash: row.hash.trim(),
    createdAt: row.createdAt,
  };
}

export class DrizzleAuditLogRepository implements AuditLogRepository {
  constructor(
    private readonly db: DbExecutor,
    private readonly hasher: Hasher,
    private readonly clock: Clock,
  ) {}

  async append(draft: AuditEntryDraft): Promise<AuditEntry> {
    // Blokada doradcza zamiast blokady wiersza z koncem lancucha. Powod jest
    // prozaiczny: przy pustej tabeli nie ma czego zablokowac, wiec dwa pierwsze
    // wpisy powstalyby rownolegle, oba wskazujac na GENESIS_HASH. Blokada zyje do
    // konca transakcji i zwalnia sie sama.
    await this.db.execute(sql`select pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK})`);

    const head = await this.db
      .select({ hash: auditLog.hash })
      .from(auditLog)
      .orderBy(desc(auditLog.seq))
      .limit(1);

    const prevHash = head[0]?.hash.trim() ?? GENESIS_HASH;

    // Numer pobierany z sekwencji przed wstawieniem, bo wchodzi do materialu
    // skrotu. Gdyby skrot liczyl sie po wstawieniu, trzeba by go dopisac
    // UPDATE-em — na tabeli, ktora UPDATE-ow nie przyjmuje.
    const seqRows = await this.db.execute<{ seq: bigint }>(
      sql`select nextval('audit_log_seq_seq')::bigint as seq`,
    );
    const seq = seqRows[0]?.seq;

    if (seq === undefined) {
      throw new Error("Nie udalo sie pobrac numeru wpisu logu audytu.");
    }

    const createdAt = this.clock.now();
    const withoutHash = { ...draft, seq, createdAt, prevHash };
    const hash = computeAuditHash(this.hasher, withoutHash);

    await this.db.insert(auditLog).values({
      seq,
      userId: draft.userId,
      action: draft.action,
      entity: draft.entity,
      entityId: draft.entityId,
      metadata: draft.metadata,
      ip: draft.ip,
      userAgent: draft.userAgent,
      prevHash,
      hash,
      createdAt,
    });

    return { ...withoutHash, hash };
  }

  async all(): Promise<readonly AuditEntry[]> {
    const rows = await this.db
      .select()
      .from(auditLog)
      .orderBy(asc(auditLog.seq));

    return rows.map((row) => toEntry(row as AuditRow));
  }
}
