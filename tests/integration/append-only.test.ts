import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { transferInternal } from "@/application/ledger/transfer";
import type { AccountId } from "@/domain/ids";
import { closeDatabase, db } from "@/infrastructure/db/client";
import { fullErrorMessage } from "@/infrastructure/db/postgres-errors";
import {
  auditDeps,
  createAccount,
  createUser,
  deps,
  fund,
  pln,
} from "../helpers/fixtures";
import { appendAuditEntry } from "@/application/audit/audit-chain";

/**
 * Test krytyczny nr 5 z sekcji 12.
 *
 * Sprawdza wyzwalacz w bazie, nie kod aplikacji. Zapytania ida prosto do
 * Postgresa, z pominieciem repozytoriow — bo obchodzenie warstwy aplikacji jest
 * dokladnie tym scenariuszem, przed ktorym ten wyzwalacz ma chronic.
 */

/**
 * Komunikat wyzwalacza lezy dwie warstwy glebiej niz `error.message`: Drizzle
 * opakowuje wyjatek sterownika we wlasny, zeby dolaczyc tresc zapytania. Asercja
 * na samym wierzchu przechodzilaby dla dowolnego bledu SQL, wiec nie odrozniala by
 * dzialajacego wyzwalacza od literowki w nazwie tabeli.
 */
async function expectRejectedByAppendOnlyGuard(
  query: Promise<unknown>,
): Promise<void> {
  await expect(query).rejects.toThrow();

  try {
    await query;
  } catch (error) {
    expect(fullErrorMessage(error)).toMatch(/tylko do dopisywania/i);
  }
}

let source: AccountId;
let target: AccountId;

beforeAll(async () => {
  const owner = await createUser();
  source = await createAccount({ owner });
  target = await createAccount({ owner });

  await fund(source, pln(100_00n));
  await transferInternal(deps, {
    idempotencyKey: `append-only-${randomUUID()}`,
    fromAccountId: source,
    toAccountId: target,
    amount: pln(10_00n),
    title: "Zapis do proby modyfikacji",
    initiatedBy: null,
  });

  await appendAuditEntry(auditDeps, {
    userId: null,
    action: "TEST_APPEND_ONLY",
    entity: null,
    entityId: null,
    metadata: {},
    ip: null,
    userAgent: null,
  });
});

afterAll(async () => {
  await closeDatabase();
});

describe("ksiega jest tylko do dopisywania", () => {
  it("odrzuca UPDATE na ledger_entries", async () => {
    await expectRejectedByAppendOnlyGuard(
      db.execute(
        sql`update ledger_entries set amount_minor = amount_minor + 1
            where account_id = ${source}`,
      ),
    );
  });

  it("odrzuca DELETE na ledger_entries", async () => {
    await expectRejectedByAppendOnlyGuard(
      db.execute(sql`delete from ledger_entries where account_id = ${source}`),
    );
  });

  it("odrzuca DELETE, ktory i tak nie trafilby w zaden wiersz", async () => {
    // Wyzwalacz jest poziomu instrukcji, nie wiersza. Intencja usuniecia czegos z
    // ksiegi jest bledem niezaleznie od tego, ile wierszy trafil warunek — wersja
    // wierszowa przepuscilaby to zapytanie w milczeniu.
    await expectRejectedByAppendOnlyGuard(
      db.execute(sql`delete from ledger_entries where false`),
    );
  });

  it("odrzuca TRUNCATE na ledger_entries", async () => {
    await expectRejectedByAppendOnlyGuard(
      db.execute(sql`truncate table ledger_entries`),
    );
  });

  it("odrzuca UPDATE i DELETE na audit_log", async () => {
    await expectRejectedByAppendOnlyGuard(
      db.execute(sql`update audit_log set action = 'ZMIENIONE'`),
    );

    await expectRejectedByAppendOnlyGuard(
      db.execute(sql`delete from audit_log where action = 'TEST_APPEND_ONLY'`),
    );
  });

  it("nadal pozwala dopisywac", async () => {
    // Kontrola pozytywna: wyzwalacz, ktory blokuje wszystko, przeszedlby
    // wszystkie testy powyzej i uczynilby aplikacje bezuzyteczna.
    const booked = await transferInternal(deps, {
      idempotencyKey: `append-only-ok-${randomUUID()}`,
      fromAccountId: source,
      toAccountId: target,
      amount: pln(1_00n),
      title: "Dopisanie po probach modyfikacji",
      initiatedBy: null,
    });

    expect(booked.entries).toHaveLength(2);
  });
});
