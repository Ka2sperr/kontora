/**
 * Identyfikatory jako typy oznaczone (branded). W czasie wykonania to zwykle
 * stringi — narzut zerowy. W czasie kompilacji `AccountId` i `TransactionId`
 * przestaja byc zamienne, wiec `postEntries(transactionId, accountId)` wywolane
 * z odwrocona kolejnoscia argumentow nie kompiluje sie.
 *
 * W ksiedze pomylenie identyfikatorow nie konczy sie bledem — konczy sie
 * poprawnie wygladajacym zapisem na niewlasciwym koncie.
 */
declare const brand: unique symbol;

type Branded<T, B extends string> = T & { readonly [brand]: B };

export type AccountId = Branded<string, "AccountId">;
export type TransactionId = Branded<string, "TransactionId">;
export type UserId = Branded<string, "UserId">;
export type FxRateId = Branded<string, "FxRateId">;

export function accountId(value: string): AccountId {
  return value as AccountId;
}

export function transactionId(value: string): TransactionId {
  return value as TransactionId;
}

export function userId(value: string): UserId {
  return value as UserId;
}

export function fxRateId(value: string): FxRateId {
  return value as FxRateId;
}
