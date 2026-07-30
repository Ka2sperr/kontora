import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { appendAuditEntry, verifyAuditChain } from "@/application/audit/audit-chain";
import { closeDatabase, db } from "@/infrastructure/db/client";
import { auditLog } from "@/infrastructure/db/schema";
import { auditDeps } from "../helpers/fixtures";

/**
 * Test krytyczny nr 6 z sekcji 12: modyfikacja wpisu w bazie z pominieciem
 * wyzwalacza powoduje, ze weryfikacja lancucha zwraca porazke ze wskazaniem
 * numeru wpisu.
 *
 * Wylaczenie wyzwalacza jest tu celowe i konieczne. Zagrozeniem, przed ktorym
 * broni lancuch skrotow, nie jest aplikacja — ta i tak nie ma sciezki UPDATE.
 * Zagrozeniem jest ktos z dostepem do bazy, a taki ktos wylaczy wyzwalacz. Test,
 * ktory tego nie robi, sprawdza wyzwalacz po raz drugi zamiast sprawdzic lancuch.
 */

afterAll(async () => {
  await closeDatabase();
});

async function withTriggersDisabled<T>(work: () => Promise<T>): Promise<T> {
  await db.execute(sql`alter table audit_log disable trigger audit_log_append_only`);

  try {
    return await work();
  } finally {
    await db.execute(sql`alter table audit_log enable trigger audit_log_append_only`);
  }
}

describe("lancuch skrotow logu audytu", () => {
  it("laczy kolejne wpisy i przechodzi weryfikacje", async () => {
    const first = await appendAuditEntry(auditDeps, {
      userId: null,
      action: "TEST_CHAIN_A",
      entity: "test",
      entityId: "1",
      metadata: { krok: 1 },
      ip: "203.0.113.7",
      userAgent: "vitest",
    });

    const second = await appendAuditEntry(auditDeps, {
      userId: null,
      action: "TEST_CHAIN_B",
      entity: "test",
      entityId: "2",
      metadata: { krok: 2, zagniezdzone: { b: 2, a: 1 } },
      ip: null,
      userAgent: null,
    });

    expect(second.seq).toBeGreaterThan(first.seq);

    const result = await verifyAuditChain(auditDeps);

    expect(result.valid).toBe(true);
  });

  it("wykrywa podmiane tresci wpisu i wskazuje jego numer", async () => {
    const target = await appendAuditEntry(auditDeps, {
      userId: null,
      action: "TEST_CHAIN_TARGET",
      entity: "transfer",
      entityId: "do-podmiany",
      metadata: { kwotaMinor: "10000" },
      ip: null,
      userAgent: null,
    });

    await appendAuditEntry(auditDeps, {
      userId: null,
      action: "TEST_CHAIN_AFTER",
      entity: null,
      entityId: null,
      metadata: {},
      ip: null,
      userAgent: null,
    });

    const broken = await withTriggersDisabled(async () => {
      // Klasyczna proba zacierania sladow: ktos zmienia kwote w metadanych
      // zaksiegowanego przelewu, zostawiajac wszystko inne na miejscu.
      await db.execute(
        sql`update audit_log
            set metadata = jsonb_set(metadata, '{kwotaMinor}', '"1"')
            where seq = ${target.seq}`,
      );

      const verification = await verifyAuditChain(auditDeps);

      await db.execute(
        sql`update audit_log
            set metadata = jsonb_set(metadata, '{kwotaMinor}', '"10000"')
            where seq = ${target.seq}`,
      );

      return verification;
    });

    expect(broken.valid).toBe(false);

    if (broken.valid === false) {
      expect(broken.brokenAtSeq).toBe(target.seq);
      expect(broken.reason).toBe("hash_mismatch");
    }

    // Po przywroceniu oryginalnej tresci lancuch znowu sie spina. Gdyby nie
    // wracal, test zostawialby po sobie baze, w ktorej kazda kolejna weryfikacja
    // jest czerwona z powodu niezwiazanego z badana zmiana.
    const restored = await verifyAuditChain(auditDeps);

    expect(restored.valid).toBe(true);
  });

  it("wykrywa usuniecie wpisu ze srodka lancucha", async () => {
    const removable = await appendAuditEntry(auditDeps, {
      userId: null,
      action: "TEST_CHAIN_REMOVABLE",
      entity: null,
      entityId: null,
      metadata: { nota: "wpis do usuniecia" },
      ip: null,
      userAgent: null,
    });

    const after = await appendAuditEntry(auditDeps, {
      userId: null,
      action: "TEST_CHAIN_AFTER_REMOVAL",
      entity: null,
      entityId: null,
      metadata: {},
      ip: null,
      userAgent: null,
    });

    const broken = await withTriggersDisabled(async () => {
      // Pelna kopia wiersza, lacznie z created_at: znacznik czasu wchodzi do
      // materialu skrotu, wiec przywrocenie go z dokladnoscia "mniej wiecej"
      // zostawiloby lancuch trwale rozspojony.
      const snapshot = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.seq, removable.seq));

      const row = snapshot[0];

      if (row === undefined) {
        throw new Error("Brak wpisu do usuniecia.");
      }

      await db.execute(sql`delete from audit_log where seq = ${removable.seq}`);

      const verification = await verifyAuditChain(auditDeps);

      await db.insert(auditLog).values(row);

      return verification;
    });

    expect(broken.valid).toBe(false);

    if (broken.valid === false) {
      // Wpis nastepny po usunietym wskazuje na poprzednika, ktorego juz nie ma —
      // to zerwane ogniwo, nie podmieniona tresc.
      expect(broken.reason).toBe("broken_link");
      expect(broken.brokenAtSeq).toBe(after.seq);
    }
  });
});
