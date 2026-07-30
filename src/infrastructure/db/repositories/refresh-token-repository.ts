import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { type UserId, userId } from "@/domain/ids";
import type {
  RefreshTokenRecord,
  RefreshTokenRepository,
} from "@/domain/ports/auth";
import type { DbExecutor } from "@/infrastructure/db/executor";
import { refreshTokens } from "@/infrastructure/db/schema";

interface RefreshTokenRow {
  id: string;
  userId: string;
  familyId: string;
  parentId: string | null;
  usedAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
}

function toRecord(row: RefreshTokenRow): RefreshTokenRecord {
  return {
    id: row.id,
    userId: userId(row.userId),
    familyId: row.familyId,
    parentId: row.parentId,
    usedAt: row.usedAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    ip: row.ip,
    userAgent: row.userAgent,
    createdAt: row.createdAt,
  };
}

export class DrizzleRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly db: DbExecutor) {}

  async findByFingerprint(
    fingerprint: string,
  ): Promise<RefreshTokenRecord | null> {
    const rows = await this.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, fingerprint))
      .limit(1);

    return rows[0] === undefined ? null : toRecord(rows[0]);
  }

  async issue(input: {
    userId: UserId;
    familyId: string;
    parentId: string | null;
    fingerprint: string;
    expiresAt: Date;
    ip: string | null;
    userAgent: string | null;
  }): Promise<RefreshTokenRecord> {
    const rows = await this.db
      .insert(refreshTokens)
      .values({
        userId: input.userId,
        familyId: input.familyId,
        parentId: input.parentId,
        tokenHash: input.fingerprint,
        expiresAt: input.expiresAt,
        ip: input.ip,
        userAgent: input.userAgent,
      })
      .returning();

    const row = rows[0];

    if (row === undefined) {
      throw new Error("INSERT nie zwrocil tokena odswiezajacego.");
    }

    return toRecord(row);
  }

  async markUsed(id: string, at: Date): Promise<void> {
    // Warunek `used_at is null` zamienia to w operacje typu compare-and-swap:
    // dwa rownolegle uzycia tego samego tokena nie moga oba zaktualizowac wiersza.
    // Bez tego wykrywanie kradziezy mialoby okno wyscigu dokladnie w momencie,
    // ktory ma wykrywac.
    await this.db
      .update(refreshTokens)
      .set({ usedAt: at })
      .where(and(eq(refreshTokens.id, id), isNull(refreshTokens.usedAt)));
  }

  async revokeFamily(familyId: string, at: Date): Promise<number> {
    const rows = await this.db
      .update(refreshTokens)
      .set({ revokedAt: at })
      .where(
        and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)),
      )
      .returning({ id: refreshTokens.id });

    return rows.length;
  }

  async revokeById(id: string, at: Date): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: at })
      .where(eq(refreshTokens.id, id));
  }

  async activeSessions(
    user: UserId,
    now: Date,
  ): Promise<readonly RefreshTokenRecord[]> {
    // Jedna rodzina to jedno urzadzenie. Rotacja tworzy w rodzinie lancuch tokenow,
    // wiec bez `DISTINCT ON` ekran "Twoje urzadzenia" pokazywalby jeden telefon
    // tyle razy, ile razy odswiezyl sesje.
    const rows = await this.db
      .select()
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.userId, user),
          isNull(refreshTokens.revokedAt),
          gt(refreshTokens.expiresAt, now),
        ),
      )
      .orderBy(desc(refreshTokens.createdAt));

    const seen = new Set<string>();
    const newest: RefreshTokenRecord[] = [];

    for (const row of rows) {
      if (seen.has(row.familyId)) {
        continue;
      }

      seen.add(row.familyId);
      newest.push(toRecord(row));
    }

    return newest;
  }

  async findFamilyHead(
    user: UserId,
    familyId: string,
  ): Promise<RefreshTokenRecord | null> {
    const rows = await this.db
      .select()
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.userId, user),
          eq(refreshTokens.familyId, familyId),
        ),
      )
      .orderBy(desc(refreshTokens.createdAt))
      .limit(1);

    return rows[0] === undefined ? null : toRecord(rows[0]);
  }
}

/** Licznik prob czytany z logu audytu — bez osobnej tabeli. */
export class AuditLogAttemptCounter {
  constructor(private readonly db: DbExecutor) {}

  async count(input: {
    action: string;
    subject: string;
    since: Date;
  }): Promise<number> {
    const [kind, value] = splitSubject(input.subject);
    // Data przekazana do surowego zapytania jako ISO-8601 z jawnym rzutowaniem.
    // Sterownik nie serializuje obiektu `Date` w parametrze zapytania pisanego
    // recznie — w zapytaniach budowanych przez Drizzle robi to warstwa wyzej,
    // ktorej tu nie ma.
    const since = input.since.toISOString();

    const rows =
      kind === "ip"
        ? await this.db.execute<{ count: bigint }>(
            sql`select count(*)::bigint as count from audit_log
                where action = ${input.action}
                  and ip = ${value}
                  and created_at >= ${since}::timestamptz`,
          )
        : await this.db.execute<{ count: bigint }>(
            sql`select count(*)::bigint as count from audit_log
                where action = ${input.action}
                  and user_id = ${value}::uuid
                  and created_at >= ${since}::timestamptz`,
          );

    return Number(rows[0]?.count ?? 0n);
  }
}

function splitSubject(subject: string): readonly ["ip" | "user", string] {
  const separator = subject.indexOf(":");
  const kind = subject.slice(0, separator);
  const value = subject.slice(separator + 1);

  return [kind === "ip" ? "ip" : "user", value];
}
