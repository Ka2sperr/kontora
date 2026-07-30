import { pgEnum } from "drizzle-orm/pg-core";
import { ACCOUNT_KINDS, ACCOUNT_STATUSES } from "@/domain/accounts/account";
import {
  TRANSACTION_KINDS,
  TRANSACTION_STATUSES,
} from "@/domain/ledger/transaction";

/**
 * Typy wyliczeniowe pochodza z domeny, nie sa tu przepisywane recznie. Dopisanie
 * rodzaju transakcji w domenie i zapomnienie o bazie danych konczy sie bledem
 * generowania migracji, a nie odkryciem w produkcji.
 *
 * Kierunek zaleznosci jest zachowany: to infrastruktura siega do domeny.
 */
export const accountKind = pgEnum("account_kind", ACCOUNT_KINDS);
export const accountStatus = pgEnum("account_status", ACCOUNT_STATUSES);
export const transactionKind = pgEnum("transaction_kind", TRANSACTION_KINDS);
export const transactionStatus = pgEnum(
  "transaction_status",
  TRANSACTION_STATUSES,
);

export const cardKind = pgEnum("card_kind", ["debit", "credit", "virtual"]);
export const cardStatus = pgEnum("card_status", [
  "active",
  "frozen",
  "blocked",
  "expired",
]);
export const cardLimitChannel = pgEnum("card_limit_channel", [
  "online",
  "contactless",
  "atm",
  "foreign",
]);
export const cardLimitPeriod = pgEnum("card_limit_period", [
  "daily",
  "monthly",
  "per_transaction",
]);
