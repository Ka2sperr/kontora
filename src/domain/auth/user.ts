import type { UserId } from "@/domain/ids";

export interface User {
  readonly id: UserId;
  readonly customerNumber: string;
  readonly passwordHash: string;
  readonly pinHash: string | null;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly isDemo: boolean;
  readonly passwordFailed: number;
  readonly passwordLockedUntil: Date | null;
  readonly pinFailed: number;
  readonly pinLockedUntil: Date | null;
  readonly createdAt: Date;
}

/**
 * Dane uzytkownika bezpieczne do wyslania na zewnatrz.
 *
 * Funkcja istnieje po to, zeby nie dalo sie przypadkiem zwrocic calego `User` z
 * endpointu — a razem z nim `passwordHash` i `pinHash`. Wybieranie pol
 * pojedynczo w kazdym kontrolerze dzialaloby do pierwszego `res.json(user)`
 * napisanego w posplechu.
 */
export interface PublicUser {
  readonly id: UserId;
  readonly customerNumber: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly isDemo: boolean;
  readonly hasPin: boolean;
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    customerNumber: user.customerNumber,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    isDemo: user.isDemo,
    hasPin: user.pinHash !== null,
  };
}
