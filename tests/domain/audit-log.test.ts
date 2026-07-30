import { describe, expect, it } from "vitest";
import {
  type AuditEntry,
  GENESIS_HASH,
  auditHashInput,
  computeAuditHash,
  verifyChain,
} from "@/domain/audit/audit-log";
import type { Hasher } from "@/domain/ports/hasher";

/**
 * Atrapa zamiast prawdziwego SHA-256. Skrot jest tu odwracalny i czytelny, wiec
 * gdy asercja padnie, w komunikacie widac, ktore pole sie nie zgadza — zamiast
 * dwoch roznych ciagow szesnastkowych, ktore nic nie mowia.
 *
 * Testowany jest lancuch, nie funkcja skrotu. Poprawnosci SHA-256 nie ma sensu
 * sprawdzac w tym repozytorium.
 */
const fakeHasher: Hasher = {
  sha256Hex: (input) =>
    Buffer.from(input).toString("hex").slice(0, 64).padEnd(64, "0"),
};

function entry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  const base: Omit<AuditEntry, "hash"> = {
    seq: 1n,
    userId: null,
    action: "LOGIN_SUCCESS",
    entity: null,
    entityId: null,
    metadata: {},
    ip: null,
    userAgent: null,
    createdAt: new Date("2026-07-30T12:00:00.000Z"),
    prevHash: GENESIS_HASH,
    ...overrides,
  };

  return { ...base, hash: overrides.hash ?? computeAuditHash(fakeHasher, base) };
}

function chain(count: number): AuditEntry[] {
  const entries: AuditEntry[] = [];
  let prevHash = GENESIS_HASH;

  for (let index = 0; index < count; index += 1) {
    const next = entry({
      seq: BigInt(index + 1),
      action: `ACTION_${index}`,
      prevHash,
    });

    entries.push(next);
    prevHash = next.hash;
  }

  return entries;
}

describe("material do skrotu", () => {
  it("nie zalezy od kolejnosci kluczy w metadanych", () => {
    // Postgres zwraca jsonb z kluczami w kolejnosci, ktorej nie kontrolujemy.
    // Gdyby material do skrotu zalezal od tej kolejnosci, kazdy wpis stawalby sie
    // nieweryfikowalny zaraz po round-tripie przez baze.
    const first = auditHashInput({
      ...entry(),
      metadata: { b: 2, a: 1, c: { z: 1, y: 2 } },
    });
    const second = auditHashInput({
      ...entry(),
      metadata: { c: { y: 2, z: 1 }, a: 1, b: 2 },
    });

    expect(first).toBe(second);
  });

  it("nie myli granic pol", () => {
    // Bez ucieczki separatora wpis o akcji "A|B" i encji "C" mialby ten sam
    // material co wpis o akcji "A" i encji "B|C" — czyli dalby sie podmienic bez
    // zerwania lancucha.
    const left = auditHashInput({ ...entry({ action: "A|B" }), entity: "C" });
    const right = auditHashInput({ ...entry({ action: "A" }), entity: "B|C" });

    expect(left).not.toBe(right);
  });
});

describe("weryfikacja lancucha", () => {
  it("przechodzi dla poprawnego lancucha", () => {
    const result = verifyChain(fakeHasher, chain(5));

    expect(result).toEqual({ valid: true, checked: 5 });
  });

  it("uznaje pusty log za poprawny", () => {
    expect(verifyChain(fakeHasher, [])).toEqual({ valid: true, checked: 0 });
  });

  it("wykrywa podmieniona tresc i wskazuje wpis", () => {
    const entries = chain(5);
    const target = entries[2];

    if (target === undefined) {
      throw new Error("Brak wpisu do podmiany.");
    }

    entries[2] = { ...target, action: "PODMIENIONE" };

    const result = verifyChain(fakeHasher, entries);

    expect(result.valid).toBe(false);

    if (result.valid === false) {
      expect(result.brokenAtSeq).toBe(3n);
      expect(result.reason).toBe("hash_mismatch");
      expect(result.checked).toBe(2);
    }
  });

  it("wykrywa usuniety wpis jako zerwane ogniwo", () => {
    const entries = chain(5);
    entries.splice(2, 1);

    const result = verifyChain(fakeHasher, entries);

    expect(result.valid).toBe(false);

    if (result.valid === false) {
      expect(result.reason).toBe("broken_link");
      expect(result.brokenAtSeq).toBe(4n);
    }
  });

  it("wykrywa lancuch zaczynajacy sie od czegos innego niz genesis", () => {
    const entries = chain(3);
    const first = entries[0];

    if (first === undefined) {
      throw new Error("Pusty lancuch.");
    }

    entries[0] = { ...first, prevHash: "f".repeat(64) };

    const result = verifyChain(fakeHasher, entries);

    expect(result.valid).toBe(false);

    if (result.valid === false) {
      expect(result.brokenAtSeq).toBe(1n);
      expect(result.reason).toBe("broken_link");
    }
  });
});
