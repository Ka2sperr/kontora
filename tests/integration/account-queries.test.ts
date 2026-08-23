import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { receiveIncoming, transferInternal } from "@/application/ledger/transfer";
import type { AccountId, UserId } from "@/domain/ids";
import { closeDatabase, db } from "@/infrastructure/db/client";
import { DrizzleAccountQueries } from "@/infrastructure/db/queries/account-queries";
import { createAccount, createUser, deps, fund, pln } from "../helpers/fixtures";

/**
 * Warstwa odczytu na prawdziwej bazie.
 *
 * Te testy pilnuja przede wszystkim **ksztaltu danych wychodzacych ze
 * sterownika**, a nie logiki. Powod jest konkretny: `db.execute` omija mapowanie
 * Drizzle, wiec adnotacja typu na surowym wierszu jest obietnica, ktorej nikt nie
 * weryfikuje. Pierwsza wersja tego zapytania deklarowala `booked_at: Date`,
 * dostawala ciag znakow i wywracala sie dopiero przy `toISOString()` w handlerze
 * — z bledem 500 bez sladu w logach.
 */

const queries = new DrizzleAccountQueries(db);

let owner: UserId;
let osobiste: AccountId;
let oszczednosciowe: AccountId;

beforeAll(async () => {
  owner = await createUser();
  osobiste = await createAccount({ owner });
  oszczednosciowe = await createAccount({ owner });

  await fund(osobiste, pln(4_500_00n));

  await transferInternal(deps, {
    idempotencyKey: `zapytania-${randomUUID()}`,
    fromAccountId: osobiste,
    toAccountId: oszczednosciowe,
    amount: pln(1_000_00n),
    title: "Przelew na oszczednosci",
    initiatedBy: owner,
    category: "przelewy wlasne",
  });

  await receiveIncoming(deps, {
    idempotencyKey: `zapytania-wplata-${randomUUID()}`,
    toAccountId: osobiste,
    amount: pln(250_00n),
    title: "Zwrot za zakupy",
    counterpartyName: "Sklep Testowy",
    category: "zakupy",
  });
});

afterAll(async () => {
  await closeDatabase();
});

describe("lista kont", () => {
  it("zwraca konta uzytkownika z saldem i waluta", async () => {
    const konta = await queries.listForUser(owner);

    expect(konta).toHaveLength(2);

    const konto = konta.find((item) => item.id === osobiste);

    expect(konto?.balance.amountMinor).toBe(3_750_00n);
    expect(typeof konto?.balance.amountMinor).toBe("bigint");
    expect(konto?.currency).toBe("PLN");
  });

  it("nie pokazuje kont innego uzytkownika", async () => {
    const obcy = await createUser();
    const konto = await queries.findForUser(obcy, osobiste);

    // Filtr po wlascicielu jest w zapytaniu, nie w sprawdzeniu po odczycie.
    // Odpowiedz dla cudzego konta jest nieodroznialna od odpowiedzi dla konta,
    // ktore nie istnieje.
    expect(konto).toBeNull();
    expect(await queries.listForUser(obcy)).toEqual([]);
  });

  it("saldo z pamieci podrecznej zgadza sie z ksiega", async () => {
    const konta = await queries.listForUser(owner);
    const suma = konta.reduce((total, konto) => total + konto.balance.amountMinor, 0n);

    expect(suma).toBe(4_750_00n);
  });
});

describe("historia operacji", () => {
  it("zwraca daty jako Date, a nie jako ciag znakow", async () => {
    // Ten jeden test to caly powod, dla ktorego ten plik istnieje.
    const strona = await queries.listTransactions({ accountId: osobiste, limit: 10 });
    const pozycja = strona.items[0];

    expect(pozycja).toBeDefined();
    expect(pozycja?.bookedAt).toBeInstanceOf(Date);
    expect(Number.isNaN(pozycja?.bookedAt.getTime())).toBe(false);
  });

  it("zwraca kwoty jako bigint, nie jako liczbe ani ciag znakow", async () => {
    const strona = await queries.listTransactions({ accountId: osobiste, limit: 10 });

    for (const pozycja of strona.items) {
      expect(typeof pozycja.amount.amountMinor).toBe("bigint");

      for (const zapis of pozycja.entries) {
        expect(typeof zapis.amount.amountMinor).toBe("bigint");
      }
    }
  });

  it("dolacza komplet zapisow ksiegowych, ktore sumuja sie do zera", async () => {
    const strona = await queries.listTransactions({ accountId: osobiste, limit: 10 });

    for (const pozycja of strona.items) {
      const suma = pozycja.entries.reduce(
        (total, zapis) => total + zapis.amount.amountMinor,
        0n,
      );

      // To zasila pasek ksiegowy — element pokazowy interfejsu. Gdyby zapisy
      // przychodzily niekompletne, suma nie byla by zerem i caly element
      // pokazywalby nieprawde.
      expect(suma).toBe(0n);
      expect(pozycja.entries.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("pokazuje wplyw na konto, o ktore pytamy, a nie cala transakcje", async () => {
    const zrodlo = await queries.listTransactions({ accountId: osobiste, limit: 10 });
    const cel = await queries.listTransactions({ accountId: oszczednosciowe, limit: 10 });

    const uZrodla = zrodlo.items.find((item) => item.title === "Przelew na oszczednosci");
    const uCelu = cel.items.find((item) => item.title === "Przelew na oszczednosci");

    expect(uZrodla?.amount.amountMinor).toBe(-1_000_00n);
    expect(uCelu?.amount.amountMinor).toBe(1_000_00n);
    expect(uZrodla?.id).toBe(uCelu?.id);
  });

  it("stronicuje kursorem bez gubienia i powtarzania wpisow", async () => {
    const pierwsza = await queries.listTransactions({ accountId: osobiste, limit: 1 });

    expect(pierwsza.items).toHaveLength(1);
    expect(pierwsza.nextCursor).not.toBeNull();

    const druga = await queries.listTransactions({
      accountId: osobiste,
      limit: 10,
      cursor: pierwsza.nextCursor ?? undefined,
    });

    const identyfikatory = [...pierwsza.items, ...druga.items].map((item) => item.id);

    expect(new Set(identyfikatory).size).toBe(identyfikatory.length);
  });

  it("filtruje po tekscie w tytule i po odbiorcy", async () => {
    const poTytule = await queries.listTransactions({
      accountId: osobiste,
      limit: 10,
      query: "zwrot",
    });

    expect(poTytule.items).toHaveLength(1);
    expect(poTytule.items[0]?.title).toBe("Zwrot za zakupy");

    const poOdbiorcy = await queries.listTransactions({
      accountId: osobiste,
      limit: 10,
      query: "Sklep Testowy",
    });

    expect(poOdbiorcy.items).toHaveLength(1);
  });

  it("traktuje znaki wieloznaczne jako tekst, a nie jako wzorzec", async () => {
    // Bez ucieczki `%` pasowaloby do wszystkiego i filtr udawalby, ze dziala.
    const wynik = await queries.listTransactions({
      accountId: osobiste,
      limit: 10,
      query: "%",
    });

    expect(wynik.items).toHaveLength(0);
  });

  it("filtruje po kwocie w jednostkach minor", async () => {
    const duze = await queries.listTransactions({
      accountId: osobiste,
      limit: 10,
      minMinor: 1_000_00n,
    });

    for (const pozycja of duze.items) {
      const bezwzgledna =
        pozycja.amount.amountMinor < 0n
          ? -pozycja.amount.amountMinor
          : pozycja.amount.amountMinor;

      expect(bezwzgledna).toBeGreaterThanOrEqual(1_000_00n);
    }
  });
});
