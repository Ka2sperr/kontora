import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { transferInternal } from "@/application/ledger/transfer";
import { closeDatabase } from "@/infrastructure/db/client";
import {
  cachedBalance,
  countEntries,
  createAccount,
  createUser,
  deps,
  fund,
  ledgerBalance,
  pln,
} from "../helpers/fixtures";

/** Test krytyczny nr 4 z sekcji 12. */

afterAll(async () => {
  await closeDatabase();
});

describe("niedozwolony debet", () => {
  it("odrzuca przelew ponad saldo i nie zostawia sladu w ksiedze", async () => {
    const owner = await createUser();
    const from = await createAccount({ owner });
    const to = await createAccount({ owner });

    await fund(from, pln(100_00n));

    const entriesBefore = await countEntries(from);

    await expect(
      transferInternal(deps, {
        idempotencyKey: `overdraft-${randomUUID()}`,
        fromAccountId: from,
        toAccountId: to,
        amount: pln(100_01n),
        title: "O grosz za duzo",
        initiatedBy: null,
      }),
    ).rejects.toThrow(/wystarczajacych srodkow/i);

    expect(await countEntries(from)).toBe(entriesBefore);
    expect(await ledgerBalance(from)).toBe(100_00n);
    expect(await ledgerBalance(to)).toBe(0n);
  });

  it("przepuszcza przelew na dokladnie cale saldo", async () => {
    // Granica jest wlaczna. Test na "o grosz za duzo" bez tego testu przechodzilby
    // takze wtedy, gdyby porownanie bylo o jeden za ostre.
    const owner = await createUser();
    const from = await createAccount({ owner });
    const to = await createAccount({ owner });

    await fund(from, pln(100_00n));

    await transferInternal(deps, {
      idempotencyKey: `overdraft-exact-${randomUUID()}`,
      fromAccountId: from,
      toAccountId: to,
      amount: pln(100_00n),
      title: "Co do grosza",
      initiatedBy: null,
    });

    expect(await ledgerBalance(from)).toBe(0n);
    expect(await ledgerBalance(to)).toBe(100_00n);
  });

  it("uwzglednia limit kredytowy, ale nie pozwala go przekroczyc", async () => {
    const owner = await createUser();
    const credit = await createAccount({
      owner,
      kind: "credit",
      creditLimitMinor: 500_00n,
    });
    const to = await createAccount({ owner });

    // Konto kredytowe z zerowym saldem i limitem 500 zl: dostepne 500 zl.
    await transferInternal(deps, {
      idempotencyKey: `credit-ok-${randomUUID()}`,
      fromAccountId: credit,
      toAccountId: to,
      amount: pln(500_00n),
      title: "Do granicy limitu",
      initiatedBy: null,
    });

    expect(await ledgerBalance(credit)).toBe(-500_00n);

    await expect(
      transferInternal(deps, {
        idempotencyKey: `credit-over-${randomUUID()}`,
        fromAccountId: credit,
        toAccountId: to,
        amount: pln(1n),
        title: "Grosz ponad limit",
        initiatedBy: null,
      }),
    ).rejects.toThrow(/wystarczajacych srodkow/i);

    expect(await ledgerBalance(credit)).toBe(-500_00n);
  });

  it("po odrzuceniu saldo podreczne nadal zgadza sie z ksiega", async () => {
    const owner = await createUser();
    const from = await createAccount({ owner });
    const to = await createAccount({ owner });

    await fund(from, pln(10_00n));

    await expect(
      transferInternal(deps, {
        idempotencyKey: `overdraft-cache-${randomUUID()}`,
        fromAccountId: from,
        toAccountId: to,
        amount: pln(999_00n),
        title: "Odrzucone",
        initiatedBy: null,
      }),
    ).rejects.toThrow();

    expect(await cachedBalance(from)).toBe(await ledgerBalance(from));
  });
});
