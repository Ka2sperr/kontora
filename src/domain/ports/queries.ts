import type { AccountKind, AccountStatus } from "@/domain/accounts/account";
import type { AccountId, TransactionId, UserId } from "@/domain/ids";
import type { Currency } from "@/domain/money/currency";
import type { Money } from "@/domain/money/money";
import type {
  LedgerEntryDraft,
  TransactionKind,
} from "@/domain/ledger/transaction";

/**
 * Porty odczytu, oddzielone od repozytoriow zapisu.
 *
 * Repozytorium odtwarza encje domenowa i sluzy podejmowaniu decyzji. Zapytanie
 * odczytowe zwraca ksztalt potrzebny ekranowi i moze laczyc tabele, ktorych zadna
 * encja nie laczy. Mieszanie tych dwoch rol konczy sie encja obrosnieta w pola
 * potrzebne wylacznie jednemu widokowi.
 */

export interface AccountSummary {
  readonly id: AccountId;
  readonly displayName: string;
  readonly iban: string | null;
  readonly currency: Currency;
  readonly kind: AccountKind;
  readonly status: AccountStatus;
  /** Z pamieci podrecznej — listy kont maja byc szybkie. */
  readonly balance: Money;
  readonly creditLimit: Money | null;
}

export interface TransactionListItem {
  readonly id: TransactionId;
  readonly kind: TransactionKind;
  readonly title: string;
  readonly counterpartyName: string | null;
  readonly counterpartyIban: string | null;
  readonly category: string | null;
  readonly merchant: string | null;
  readonly bookedAt: Date;
  /** Wplyw na konto, o ktore pytamy — nie cala transakcja. */
  readonly amount: Money;
  /** Wszystkie zapisy transakcji. Zasilaja pasek ksiegowy. */
  readonly entries: readonly {
    readonly accountId: AccountId;
    readonly accountName: string;
    readonly amount: Money;
  }[];
}

export interface TransactionFilter {
  readonly accountId: AccountId;
  readonly from?: Date | undefined;
  readonly to?: Date | undefined;
  readonly category?: string | undefined;
  readonly minMinor?: bigint | undefined;
  readonly maxMinor?: bigint | undefined;
  readonly query?: string | undefined;
  /**
   * Kursor: identyfikator ostatniego wpisu ksiegi z poprzedniej strony.
   *
   * Kursor, nie offset. Przy `OFFSET` dopisanie transakcji miedzy zadaniami
   * przesuwa wszystko o jeden i uzytkownik widzi ten sam wiersz dwa razy albo nie
   * widzi go wcale. Kursor po malejacym identyfikatorze wpisu jest odporny na
   * dopisania, bo ksiega jest tylko do dopisywania i identyfikatory rosna.
   */
  readonly cursor?: string | undefined;
  readonly limit: number;
}

export interface TransactionPage {
  readonly items: readonly TransactionListItem[];
  readonly nextCursor: string | null;
}

export interface SpendingByCategory {
  readonly category: string;
  readonly month: string;
  readonly total: Money;
}

export interface AccountQueries {
  listForUser(userId: UserId): Promise<readonly AccountSummary[]>;
  findForUser(userId: UserId, accountId: AccountId): Promise<AccountSummary | null>;
  listTransactions(filter: TransactionFilter): Promise<TransactionPage>;
  entriesOfTransaction(
    transaction: TransactionId,
  ): Promise<readonly LedgerEntryDraft[]>;
  spendingByCategory(
    userId: UserId,
    months: number,
  ): Promise<readonly SpendingByCategory[]>;
}
