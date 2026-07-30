import { eq, sql } from "drizzle-orm";
import type { User } from "@/domain/auth/user";
import { DomainError } from "@/domain/errors";
import { type UserId, userId } from "@/domain/ids";
import type { UserRepository } from "@/domain/ports/auth";
import type { DbExecutor } from "@/infrastructure/db/executor";
import { isUniqueViolation } from "@/infrastructure/db/postgres-errors";
import { users } from "@/infrastructure/db/schema";

interface UserRow {
  id: string;
  customerNumber: string;
  passwordHash: string;
  pinHash: string | null;
  firstName: string;
  lastName: string;
  email: string;
  isDemo: boolean;
  passwordFailed: number;
  passwordLockedUntil: Date | null;
  pinFailed: number;
  pinLockedUntil: Date | null;
  createdAt: Date;
}

function toUser(row: UserRow): User {
  return {
    id: userId(row.id),
    // char(8) dopelnia spacjami przy krotszej wartosci; trim chroni przed
    // porownaniem, ktore nie zadziala z powodu niewidocznego znaku.
    customerNumber: row.customerNumber.trim(),
    passwordHash: row.passwordHash,
    pinHash: row.pinHash,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    isDemo: row.isDemo,
    passwordFailed: row.passwordFailed,
    passwordLockedUntil: row.passwordLockedUntil,
    pinFailed: row.pinFailed,
    pinLockedUntil: row.pinLockedUntil,
    createdAt: row.createdAt,
  };
}

export class DrizzleUserRepository implements UserRepository {
  constructor(private readonly db: DbExecutor) {}

  async findById(id: UserId): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    return rows[0] === undefined ? null : toUser(rows[0]);
  }

  async findByCustomerNumber(customerNumber: string): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.customerNumber, customerNumber))
      .limit(1);

    return rows[0] === undefined ? null : toUser(rows[0]);
  }

  async findDemoUser(): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.isDemo, true))
      .limit(1);

    return rows[0] === undefined ? null : toUser(rows[0]);
  }

  async create(input: {
    customerNumber: string;
    passwordHash: string;
    pinHash: string | null;
    firstName: string;
    lastName: string;
    email: string;
    isDemo: boolean;
  }): Promise<User> {
    try {
      const rows = await this.db.insert(users).values(input).returning();
      const row = rows[0];

      if (row === undefined) {
        throw new Error("INSERT nie zwrocil utworzonego uzytkownika.");
      }

      return toUser(row);
    } catch (error) {
      if (isUniqueViolation(error, "users_email_unique")) {
        throw new DomainError(
          "EMAIL_TAKEN",
          "Na ten adres jest juz zalozone konto.",
        );
      }

      throw error;
    }
  }

  async nextCustomerSequence(): Promise<number> {
    // `nextval` jest atomowy i nie wycofuje sie przy rollbacku. Dziura w sekwencji
    // po nieudanej rejestracji jest tu zaleta: numery klienta i tak nie maja byc
    // ciagle, a gwarancja unikalnosci jest wazniejsza niz oszczednosc.
    const rows = await this.db.execute<{ value: bigint }>(
      sql`select nextval('customer_number_seq')::bigint as value`,
    );

    const value = rows[0]?.value;

    if (value === undefined) {
      throw new Error("Nie udalo sie pobrac numeru z sekwencji.");
    }

    return Number(value);
  }

  async recordPasswordFailure(id: UserId): Promise<number> {
    const rows = await this.db
      .update(users)
      .set({ passwordFailed: sql`${users.passwordFailed} + 1` })
      .where(eq(users.id, id))
      .returning({ failed: users.passwordFailed });

    return rows[0]?.failed ?? 0;
  }

  async clearPasswordFailures(id: UserId): Promise<void> {
    await this.db
      .update(users)
      .set({ passwordFailed: 0, passwordLockedUntil: null })
      .where(eq(users.id, id));
  }

  async setPasswordLock(id: UserId, until: Date | null): Promise<void> {
    await this.db
      .update(users)
      .set({ passwordLockedUntil: until })
      .where(eq(users.id, id));
  }

  async recordPinFailure(id: UserId): Promise<number> {
    const rows = await this.db
      .update(users)
      .set({ pinFailed: sql`${users.pinFailed} + 1` })
      .where(eq(users.id, id))
      .returning({ failed: users.pinFailed });

    return rows[0]?.failed ?? 0;
  }

  async clearPinFailures(id: UserId): Promise<void> {
    await this.db
      .update(users)
      .set({ pinFailed: 0, pinLockedUntil: null })
      .where(eq(users.id, id));
  }

  async setPinLock(id: UserId, until: Date | null): Promise<void> {
    await this.db
      .update(users)
      .set({ pinLockedUntil: until })
      .where(eq(users.id, id));
  }

  async setPinHash(id: UserId, pinHash: string): Promise<void> {
    await this.db.update(users).set({ pinHash }).where(eq(users.id, id));
  }

  async setPasswordHash(id: UserId, passwordHash: string): Promise<void> {
    await this.db.update(users).set({ passwordHash }).where(eq(users.id, id));
  }
}
