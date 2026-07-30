import type { Account, LockedAccount } from "@/domain/accounts/account";
import type { AuditLogRepository } from "@/domain/ports/audit-log-repository";
import type { AccountId, TransactionId } from "@/domain/ids";
import type { Currency } from "@/domain/money/currency";
import type { Money } from "@/domain/money/money";
import type {
  BookedTransaction,
  LedgerEntryDraft,
  TransactionDraft,
} from "@/domain/ledger/transaction";

/**
 * Porty dostepu do danych. Domena opisuje, czego potrzebuje; jak to zdobyc, wie
 * wylacznie adapter w `src/infrastructure/`. Zaden z tych interfejsow nie
 * wspomina o SQL, o Drizzle ani o transakcji bazodanowej — poza `UnitOfWork`,
 * ktorego cala rola jest wlasnie ta granica.
 */

export interface AccountRepository {
  findById(id: AccountId): Promise<Account | null>;

  findByInternalCode(code: string): Promise<Account | null>;

  /**
   * Blokuje wiersze kont do konca biezacej transakcji bazodanowej i zwraca ich
   * stan. Kolejnosc blokowania ustala implementacja (rosnacy identyfikator) —
   * wolajacy nie moze jej zmienic, bo nie moze o niej wiedziec.
   *
   * Rzuca ACCOUNT_NOT_FOUND, jesli ktorekolwiek konto nie istnieje. Czesciowa
   * blokada jest gorsza niz zadna: zajmuje wiersze, a operacji i tak nie da sie
   * dokonczyc.
   *
   * Zwraca mape, a nie tablice, bo kolejnosc wyniku jest narzucona przez
   * kolejnosc blokowania, a nie przez kolejnosc argumentow — tablica kusilaby do
   * odczytu `result[0]` jako "konto zrodlowe", co bywaloby prawda.
   */
  lockByIds(
    ids: readonly AccountId[],
  ): Promise<ReadonlyMap<AccountId, LockedAccount>>;

  lockByInternalCodes(
    codes: readonly string[],
  ): Promise<ReadonlyMap<string, LockedAccount>>;

  /**
   * Przelicza `balance_cached_minor` z zapisow ksiegi dla podanych kont.
   * Wolane w tej samej transakcji co dopisanie zapisow (zasada nienaruszalna
   * nr 2), na kontach juz zablokowanych.
   */
  refreshCachedBalances(ids: readonly AccountId[]): Promise<void>;
}

export interface TransactionRepository {
  findByIdempotencyKey(key: string): Promise<BookedTransaction | null>;

  /**
   * Wstawia naglowek transakcji. Rzuca DomainError IDEMPOTENCY_CONFLICT, gdy
   * klucz idempotencji jest juz zajety — adapter tlumaczy na to naruszenie
   * ograniczenia UNIQUE, bo sprawdzenie "czy istnieje" przed wstawieniem ma okno
   * wyscigu, a ograniczenie w bazie go nie ma.
   */
  insert(draft: TransactionDraft, bookedAt: Date): Promise<TransactionId>;

  findById(id: TransactionId): Promise<BookedTransaction | null>;
}

export interface LedgerRepository {
  append(
    transaction: TransactionId,
    entries: readonly LedgerEntryDraft[],
  ): Promise<void>;

  /** Saldo policzone z zapisow, nie odczytane z pamieci podrecznej. */
  balanceOf(account: AccountId, currency: Currency): Promise<Money>;

  entriesOf(
    transaction: TransactionId,
  ): Promise<readonly LedgerEntryDraft[]>;
}

export interface Repositories {
  readonly accounts: AccountRepository;
  readonly transactions: TransactionRepository;
  readonly ledger: LedgerRepository;
  readonly audit: AuditLogRepository;
}
