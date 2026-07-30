import type { UserId } from "@/domain/ids";
import type { Hasher } from "@/domain/ports/hasher";

/**
 * Log audytu z lancuchem skrotow.
 *
 * Kazdy wpis zawiera skrot poprzedniego, wiec zmiana czegokolwiek w srodku
 * rozspaja lancuch w tym miejscu i we wszystkich nastepnych. To nie czyni logu
 * niezmiennym — kto ma prawa do bazy, przeliczy caly lancuch od nowa. Czyni go
 * *wykrywalnie* zmienionym, a to jedyna gwarancja, jaka mozna dac bez zewnetrznego
 * notariusza.
 */

/** Skrot poprzednika pierwszego wpisu. 64 zera nie sa wynikiem zadnego SHA-256. */
export const GENESIS_HASH = "0".repeat(64);

export interface AuditEntryDraft {
  readonly userId: UserId | null;
  readonly action: string;
  readonly entity: string | null;
  readonly entityId: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly ip: string | null;
  readonly userAgent: string | null;
}

export interface AuditEntry extends AuditEntryDraft {
  readonly seq: bigint;
  readonly createdAt: Date;
  readonly prevHash: string;
  readonly hash: string;
}

/**
 * Kanoniczny zapis wartosci. `JSON.stringify` nie nadaje sie do liczenia skrotow:
 * kolejnosc kluczy obiektu zalezy od kolejnosci ich wstawiania, wiec ten sam
 * logicznie obiekt dawalby rozne skroty po round-tripie przez baze.
 */
function canonical(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonical(entryValue)}`);

  return `{${entries.join(",")}}`;
}

/**
 * Material do skrotu. Pola rozdzielone znakiem, ktory nie moze wystapic w
 * zadnym z nich bez ucieczki — inaczej wpis o akcji "A|B" i encji "C" mialby ten
 * sam skrot co wpis o akcji "A" i encji "B|C".
 */
export function auditHashInput(
  entry: Omit<AuditEntry, "hash">,
): string {
  return [
    entry.seq.toString(),
    entry.userId ?? "",
    entry.action,
    entry.entity ?? "",
    entry.entityId ?? "",
    canonical(entry.metadata),
    entry.createdAt.toISOString(),
    entry.prevHash,
  ]
    .map((part) => part.replaceAll("\\", "\\\\").replaceAll("|", "\\|"))
    .join("|");
}

export function computeAuditHash(
  hasher: Hasher,
  entry: Omit<AuditEntry, "hash">,
): string {
  return hasher.sha256Hex(auditHashInput(entry));
}

export type ChainVerification =
  | { readonly valid: true; readonly checked: number }
  | {
      readonly valid: false;
      readonly checked: number;
      readonly brokenAtSeq: bigint;
      readonly reason: "hash_mismatch" | "broken_link";
    };

/**
 * Sprawdza lancuch od poczatku. Zwraca numer pierwszego wpisu, ktory sie nie
 * zgadza — sam fakt "cos jest nie tak" nie pomaga nikomu w dochodzeniu.
 *
 * Rozroznia dwa rodzaje uszkodzenia, bo znacza co innego. `hash_mismatch`:
 * tresc wpisu zostala zmieniona. `broken_link`: wpis jest spojny wewnetrznie, ale
 * wskazuje na innego poprzednika niz faktyczny — ktos usunal albo wstawil wpis w
 * srodku.
 */
export function verifyChain(
  hasher: Hasher,
  entries: readonly AuditEntry[],
): ChainVerification {
  let expectedPrevHash = GENESIS_HASH;
  let checked = 0;

  for (const entry of entries) {
    if (entry.prevHash !== expectedPrevHash) {
      return {
        valid: false,
        checked,
        brokenAtSeq: entry.seq,
        reason: "broken_link",
      };
    }

    if (computeAuditHash(hasher, entry) !== entry.hash) {
      return {
        valid: false,
        checked,
        brokenAtSeq: entry.seq,
        reason: "hash_mismatch",
      };
    }

    expectedPrevHash = entry.hash;
    checked += 1;
  }

  return { valid: true, checked };
}
