import { asc, eq, inArray, sql } from "drizzle-orm";
import type { Account, LockedAccount } from "@/domain/accounts/account";
import { DomainError } from "@/domain/errors";
import { type AccountId, type UserId, accountId } from "@/domain/ids";
import { assertCurrency } from "@/domain/money/currency";
import { money } from "@/domain/money/money";
import type { AccountRepository } from "@/domain/ports/repositories";
import type { DbExecutor } from "@/infrastructure/db/executor";
import { accounts } from "@/infrastructure/db/schema";

/**
 * Saldo liczone z ksiegi, nie odczytane z `balance_cached_minor`.
 *
 * Kolumna z pamiecia podreczna sluzy widokom list, gdzie liczy sie czas
 * odpowiedzi. Decyzja "czy stac cie na ten przelew" zapada wylacznie na podstawie
 * sumy zapisow — gdyby czytala pamiec podreczna, jej rozjazd z ksiega zamienialby
 * sie w prawdziwe pieniadze.
 */
// Nazwa kolumny jest wpisana wprost jako `accounts.id`, a nie wstrzyknieta przez
// referencje do kolumny. Drizzle renderuje referencje bez kwalifikatora tabeli, a
// wewnatrz tej podzapytania samo `"id"` trafiloby na `ledger_entries.id` — czyli
// na bigint zamiast uuid.
const balanceFromLedger = sql<bigint>`coalesce((
  select sum(le.amount_minor)
  from ledger_entries le
  where le.account_id = accounts.id
), 0)::bigint`;

const accountColumns = {
  id: accounts.id,
  userId: accounts.userId,
  internalCode: accounts.internalCode,
  currency: accounts.currency,
  kind: accounts.kind,
  status: accounts.status,
  creditLimitMinor: accounts.creditLimitMinor,
  balanceMinor: balanceFromLedger,
};

type AccountRow = {
  id: string;
  userId: string | null;
  internalCode: string | null;
  currency: string;
  kind: Account["kind"];
  status: Account["status"];
  creditLimitMinor: bigint | null;
  balanceMinor: bigint;
};

function toAccount(row: AccountRow): Account {
  const currency = assertCurrency(row.currency.trim());

  return {
    id: accountId(row.id),
    userId: row.userId === null ? null : (row.userId as UserId),
    internalCode: row.internalCode,
    currency,
    kind: row.kind,
    status: row.status,
    balance: money(row.balanceMinor, currency),
    creditLimit:
      row.creditLimitMinor === null
        ? null
        : money(row.creditLimitMinor, currency),
  };
}

/**
 * Jedyne miejsce w calym kodzie, ktore nadaje znacznik `LockedAccount`. Rzutowanie
 * jest tu poprawne, bo wiersz przyszedl z zapytania z klauzula FOR UPDATE i jest
 * zablokowany do konca transakcji. Gdziekolwiek indziej to samo rzutowanie byloby
 * klamstwem — i dlatego nie ma dla niego publicznej funkcji pomocniczej.
 */
function toLockedAccount(row: AccountRow): LockedAccount {
  return toAccount(row) as LockedAccount;
}

export class DrizzleAccountRepository implements AccountRepository {
  constructor(private readonly db: DbExecutor) {}

  async findById(id: AccountId): Promise<Account | null> {
    const rows = await this.db
      .select(accountColumns)
      .from(accounts)
      .where(eq(accounts.id, id))
      .limit(1);

    return rows[0] === undefined ? null : toAccount(rows[0]);
  }

  async findByInternalCode(code: string): Promise<Account | null> {
    const rows = await this.db
      .select(accountColumns)
      .from(accounts)
      .where(eq(accounts.internalCode, code))
      .limit(1);

    return rows[0] === undefined ? null : toAccount(rows[0]);
  }

  async lockByIds(
    ids: readonly AccountId[],
  ): Promise<ReadonlyMap<AccountId, LockedAccount>> {
    const wanted = [...new Set(ids)];

    if (wanted.length === 0) {
      return new Map();
    }

    // `ORDER BY id` przed `FOR UPDATE` to cala ochrona przed zakleszczeniem
    // (zasada nienaruszalna nr 6). W planie zapytania wezel LockRows stoi nad
    // sortowaniem, wiec wiersze sa blokowane w kolejnosci posortowanej. Gdy dwa
    // rownolegle przelewy dotykaja tej samej pary kont w przeciwnych kierunkach,
    // oba i tak siegaja po nie w tej samej kolejnosci — jeden czeka, zamiast
    // czekac wzajemnie na siebie.
    const rows = await this.db
      .select(accountColumns)
      .from(accounts)
      .where(inArray(accounts.id, wanted))
      .orderBy(asc(accounts.id))
      .for("update");

    if (rows.length !== wanted.length) {
      const found = new Set(rows.map((row) => row.id));
      const missing = wanted.filter((id) => !found.has(id));

      throw new DomainError(
        "ACCOUNT_NOT_FOUND",
        `Nie znaleziono kont: ${missing.join(", ")}.`,
      );
    }

    return new Map(
      rows.map((row) => [accountId(row.id), toLockedAccount(row)]),
    );
  }

  async lockByInternalCodes(
    codes: readonly string[],
  ): Promise<ReadonlyMap<string, LockedAccount>> {
    const wanted = [...new Set(codes)];

    if (wanted.length === 0) {
      return new Map();
    }

    const rows = await this.db
      .select(accountColumns)
      .from(accounts)
      .where(inArray(accounts.internalCode, wanted))
      .orderBy(asc(accounts.id))
      .for("update");

    if (rows.length !== wanted.length) {
      const found = new Set(
        rows.map((row) => row.internalCode).filter((code) => code !== null),
      );
      const missing = wanted.filter((code) => !found.has(code));

      throw new DomainError(
        "ACCOUNT_NOT_FOUND",
        `Brak kont wewnetrznych banku: ${missing.join(", ")}. Powinny powstac w migracji.`,
      );
    }

    return new Map(
      rows.flatMap((row) =>
        row.internalCode === null
          ? []
          : [[row.internalCode, toLockedAccount(row)] as const],
      ),
    );
  }

  async refreshCachedBalances(ids: readonly AccountId[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    // Pelne przeliczenie z ksiegi, a nie `balance = balance + delta`. Wersja
    // przyrostowa jest tansza, ale utrwala kazdy raz powstaly rozjazd; ta wersja
    // sama go naprawia przy najblizszej operacji na koncie. Wiersze sa juz
    // zablokowane przez lockByIds, wiec nie ma tu wyscigu.
    await this.db
      .update(accounts)
      .set({
        balanceCachedMinor: sql`coalesce((
          select sum(le.amount_minor)
          from ledger_entries le
          where le.account_id = accounts.id
        ), 0)::bigint`,
      })
      .where(inArray(accounts.id, [...new Set(ids)]));
  }
}
