import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { demoLogin } from "@/application/auth/demo-login";
import { AUTH_ACTIONS } from "@/application/auth/deps";
import { login } from "@/application/auth/login";
import { setPin, verifyPin } from "@/application/auth/pin";
import { refreshSession } from "@/application/auth/refresh";
import { register } from "@/application/auth/register";
import {
  listSessions,
  loginHistory,
  logout,
  revokeSession,
} from "@/application/auth/sessions";
import { levelOf } from "@/domain/auth/session";
import { isDomainError } from "@/domain/errors";
import { closeDatabase, db } from "@/infrastructure/db/client";
import {
  STRONG_PASSWORD,
  TestClock,
  testAuthDeps,
  testContext,
  uniqueEmail,
} from "../helpers/auth";

// Jeden adres na plik testowy, unikalny przy kazdym uruchomieniu.
const CONTEXT = testContext();

/**
 * Definicja ukonczenia Etapu 2: testy blokad i wykrywania ponownego uzycia tokena
 * sa zielone, a kazde zdarzenie uwierzytelniania trafia do logu audytu.
 *
 * Testy uzywaja prawdziwego Argon2id — sprawdzenie hashowania atrapa sprawdzaloby
 * atrape. Zegar jest za to sterowany, bo inaczej test blokady na kwadrans
 * trwalby kwadrans.
 */

afterAll(async () => {
  await closeDatabase();
});

async function auditActionsFor(userIdValue: string): Promise<string[]> {
  const rows = await db.execute<{ action: string }>(
    sql`select action from audit_log where user_id = ${userIdValue}::uuid order by seq`,
  );

  return rows.map((row) => row.action);
}

async function registerUser(clock: TestClock, pin = "4321") {
  const deps = testAuthDeps(clock);

  const { customerNumber } = await register(
    deps,
    {
      firstName: "Jan",
      lastName: "Testowy",
      email: uniqueEmail(),
      password: STRONG_PASSWORD,
      pin,
    },
    CONTEXT,
  );

  return { deps, customerNumber };
}

describe("rejestracja i logowanie", () => {
  it("rejestruje, loguje i odnotowuje oba zdarzenia w logu audytu", async () => {
    const clock = new TestClock();
    const { deps, customerNumber } = await registerUser(clock);

    expect(customerNumber).toMatch(/^\d{8}$/);

    const session = await login(
      deps,
      { customerNumber, password: STRONG_PASSWORD },
      CONTEXT,
    );

    expect(session.user.customerNumber).toBe(customerNumber);
    expect(session.user.hasPin).toBe(true);
    expect(session.accessToken.split(".")).toHaveLength(3);

    const actions = await auditActionsFor(session.user.id);

    expect(actions).toContain(AUTH_ACTIONS.registered);
    expect(actions).toContain(AUTH_ACTIONS.loginSuccess);
  });

  it("nie zdradza, czy numer klienta istnieje", async () => {
    const clock = new TestClock();
    const { deps, customerNumber } = await registerUser(clock);

    const wrongPassword = login(
      deps,
      { customerNumber, password: "zupelnie-inne-haslo-2026" },
      CONTEXT,
    );
    const unknownCustomer = login(
      deps,
      { customerNumber: "00000000", password: STRONG_PASSWORD },
      CONTEXT,
    );

    // Ten sam kod i ta sama tresc w obu przypadkach. Roznica podpowiadalaby,
    // ktore numery klienta istnieja.
    await expect(wrongPassword).rejects.toThrow(/niepoprawne/i);
    await expect(unknownCustomer).rejects.toThrow(/niepoprawne/i);
  });

  it("nowa sesja nie jest podniesiona", async () => {
    const clock = new TestClock();
    const { deps, customerNumber } = await registerUser(clock);

    const session = await login(
      deps,
      { customerNumber, password: STRONG_PASSWORD },
      CONTEXT,
    );

    const claims = await deps.accessTokens.verify(session.accessToken);

    expect(claims).not.toBeNull();
    expect(levelOf(claims!, clock.now())).toBe("authenticated");
  });
});

describe("blokada hasla", () => {
  it("blokuje konto po piatej nieudanej probie i zwalnia je po kwadransie", async () => {
    const clock = new TestClock();
    const { deps, customerNumber } = await registerUser(clock);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        login(deps, { customerNumber, password: "zle-haslo-numer-jeden" }, CONTEXT),
      ).rejects.toThrow();
    }

    // Szosta proba — tym razem z poprawnym haslem. Blokada dziala mimo tego, bo
    // inaczej wystarczyloby zgadnac haslo za piecdziesiatym razem.
    await expect(
      login(deps, { customerNumber, password: STRONG_PASSWORD }, CONTEXT),
    ).rejects.toThrow(/zablokowane/i);

    clock.advanceMinutes(15);

    const session = await login(
      deps,
      { customerNumber, password: STRONG_PASSWORD },
      CONTEXT,
    );

    expect(session.user.customerNumber).toBe(customerNumber);

    const actions = await auditActionsFor(session.user.id);

    expect(actions.filter((action) => action === AUTH_ACTIONS.loginFailed)).toHaveLength(5);
    expect(actions).toContain(AUTH_ACTIONS.loginLocked);
  });
});

describe("PIN jako podniesienie sesji", () => {
  it("podnosi sesje na piec minut i pozwala jej opasc", async () => {
    const clock = new TestClock();
    const { deps, customerNumber } = await registerUser(clock, "1379");

    const session = await login(
      deps,
      { customerNumber, password: STRONG_PASSWORD },
      CONTEXT,
    );
    const claims = await deps.accessTokens.verify(session.accessToken);

    const elevated = await verifyPin(deps, claims!, "1379", CONTEXT);
    const elevatedClaims = await deps.accessTokens.verify(elevated.accessToken);

    expect(levelOf(elevatedClaims!, clock.now())).toBe("elevated");

    clock.advanceMs(5 * 60 * 1000);

    expect(levelOf(elevatedClaims!, clock.now())).toBe("authenticated");
  });

  it("podniesienie nie przedluza zycia sesji", async () => {
    // Inaczej wystarczyloby wpisywac PIN co pare minut, zeby nie wylogowac sie
    // nigdy — a token dostepu ma zyc pietnascie minut niezaleznie od tego.
    const clock = new TestClock();
    const { deps, customerNumber } = await registerUser(clock, "2468");

    const session = await login(
      deps,
      { customerNumber, password: STRONG_PASSWORD },
      CONTEXT,
    );
    const claims = await deps.accessTokens.verify(session.accessToken);

    clock.advanceMinutes(10);

    const elevated = await verifyPin(deps, claims!, "2468", CONTEXT);
    const elevatedClaims = await deps.accessTokens.verify(elevated.accessToken);

    expect(elevatedClaims?.expiresAt.getTime()).toBe(claims?.expiresAt.getTime());
  });

  it("blokuje PIN twardo po trzech bledach i odblokowuje go dopiero haslem", async () => {
    const clock = new TestClock();
    const { deps, customerNumber } = await registerUser(clock, "5555");

    const session = await login(
      deps,
      { customerNumber, password: STRONG_PASSWORD },
      CONTEXT,
    );
    const claims = await deps.accessTokens.verify(session.accessToken);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(verifyPin(deps, claims!, "0000", CONTEXT)).rejects.toThrow();
    }

    // Poprawny PIN juz nie pomaga. Blokada jest twarda, nie czasowa — czekanie
    // nic nie da, bo przy dziesieciu tysiacach kombinacji czekanie zawsze sie
    // atakujacemu oplaca.
    //
    // Dziesiec minut, nie godzina: token dostepu zyje pietnascie minut, a po jego
    // wygasnieciu test sprawdzalby wygasniecie sesji zamiast blokady PIN-u.
    clock.advanceMinutes(10);

    await expect(verifyPin(deps, claims!, "5555", CONTEXT)).rejects.toThrow(
      /zablokowany/i,
    );

    const relogin = await login(
      deps,
      { customerNumber, password: STRONG_PASSWORD },
      CONTEXT,
    );
    const freshClaims = await deps.accessTokens.verify(relogin.accessToken);

    const elevated = await verifyPin(deps, freshClaims!, "5555", CONTEXT);

    expect(elevated.elevatedUntil.getTime()).toBeGreaterThan(clock.now().getTime());

    const actions = await auditActionsFor(session.user.id);

    expect(actions).toContain(AUTH_ACTIONS.pinFailed);
    expect(actions).toContain(AUTH_ACTIONS.pinLocked);
    expect(actions).toContain(AUTH_ACTIONS.pinUnlocked);
    expect(actions).toContain(AUTH_ACTIONS.pinVerified);
  });

  it("pozwala ustawic PIN kontu, ktore go nie ma", async () => {
    const clock = new TestClock();
    const deps = testAuthDeps(clock);

    const { customerNumber } = await register(
      deps,
      {
        firstName: "Bez",
        lastName: "Pinu",
        email: uniqueEmail(),
        password: STRONG_PASSWORD,
      },
      CONTEXT,
    );

    const session = await login(
      deps,
      { customerNumber, password: STRONG_PASSWORD },
      CONTEXT,
    );
    const claims = await deps.accessTokens.verify(session.accessToken);

    await expect(verifyPin(deps, claims!, "1234", CONTEXT)).rejects.toThrow(
      /nie ma jeszcze/i,
    );

    await setPin(deps, claims!, "9182", CONTEXT);

    const elevated = await verifyPin(deps, claims!, "9182", CONTEXT);

    expect(elevated.elevatedUntil.getTime()).toBeGreaterThan(clock.now().getTime());
  });
});

describe("rotacja tokenow odswiezajacych", () => {
  it("kazde odswiezenie wydaje nowy token i uniewaznia poprzedni", async () => {
    const clock = new TestClock();
    const { deps, customerNumber } = await registerUser(clock);

    const session = await login(
      deps,
      { customerNumber, password: STRONG_PASSWORD },
      CONTEXT,
    );

    clock.advanceMinutes(20);

    const rotated = await refreshSession(deps, session.refreshToken, CONTEXT);

    expect(rotated.refreshToken).not.toBe(session.refreshToken);
    expect(rotated.familyId).toBe(session.familyId);

    const rotatedAgain = await refreshSession(
      deps,
      rotated.refreshToken,
      CONTEXT,
    );

    expect(rotatedAgain.familyId).toBe(session.familyId);
  });

  it("wykrywa ponowne uzycie tokena i uniewaznia cala rodzine", async () => {
    const clock = new TestClock();
    const { deps, customerNumber } = await registerUser(clock);

    const session = await login(
      deps,
      { customerNumber, password: STRONG_PASSWORD },
      CONTEXT,
    );

    const rotated = await refreshSession(deps, session.refreshToken, CONTEXT);

    // Ktos uzywa tokena, ktory uczciwy klient juz wymienil. Znaczy to, ze istnieja
    // dwie kopie — a nie da sie stwierdzic, ktora nalezy do wlasciciela.
    await expect(
      refreshSession(deps, session.refreshToken, CONTEXT),
    ).rejects.toThrow(/wylogowalismy/i);

    // Dlatego pada cala rodzina, lacznie z tokenem, ktory chwile temu byl wazny.
    await expect(
      refreshSession(deps, rotated.refreshToken, CONTEXT),
    ).rejects.toThrow();

    const actions = await auditActionsFor(session.user.id);

    expect(actions).toContain(AUTH_ACTIONS.theftSuspected);
  });

  it("odrzuca token po wygasnieciu", async () => {
    const clock = new TestClock();
    const { deps, customerNumber } = await registerUser(clock);

    const session = await login(
      deps,
      { customerNumber, password: STRONG_PASSWORD },
      CONTEXT,
    );

    clock.advanceMs(8 * 24 * 60 * 60 * 1000);

    await expect(
      refreshSession(deps, session.refreshToken, CONTEXT),
    ).rejects.toThrow(/wygasla|zakonczona/i);
  });

  it("odrzuca token, ktorego nie ma w bazie", async () => {
    const clock = new TestClock();
    const deps = testAuthDeps(clock);

    await expect(
      refreshSession(deps, "wymyslony-token-ktorego-nikt-nie-wydal", CONTEXT),
    ).rejects.toThrow();
  });
});

describe("urzadzenia i historia", () => {
  it("pokazuje jedna pozycje na urzadzenie mimo rotacji", async () => {
    const clock = new TestClock();
    const { deps, customerNumber } = await registerUser(clock);

    const first = await login(
      deps,
      { customerNumber, password: STRONG_PASSWORD },
      CONTEXT,
    );
    await login(deps, { customerNumber, password: STRONG_PASSWORD }, CONTEXT);

    // Rotacja tworzy w rodzinie kolejne tokeny. Bez zwijania do rodzin ta lista
    // rosla by przy kazdym odswiezeniu i uzytkownik widzialby dziesiatki "urzadzen".
    await refreshSession(deps, first.refreshToken, CONTEXT);

    const claims = await deps.accessTokens.verify(first.accessToken);
    const sessions = await listSessions(deps, claims!);

    expect(sessions).toHaveLength(2);
    expect(sessions.filter((session) => session.current)).toHaveLength(1);
  });

  it("wylogowanie urzadzenia uniewaznia jego cala rodzine", async () => {
    const clock = new TestClock();
    const { deps, customerNumber } = await registerUser(clock);

    const staying = await login(
      deps,
      { customerNumber, password: STRONG_PASSWORD },
      CONTEXT,
    );
    const leaving = await login(
      deps,
      { customerNumber, password: STRONG_PASSWORD },
      CONTEXT,
    );

    const claims = await deps.accessTokens.verify(staying.accessToken);
    const sessions = await listSessions(deps, claims!);
    const target = sessions.find((session) => !session.current);

    const result = await revokeSession(deps, claims!, target!.id, CONTEXT);

    expect(result.self).toBe(false);

    await expect(
      refreshSession(deps, leaving.refreshToken, CONTEXT),
    ).rejects.toThrow();

    // Sesja, ktora zostala, dziala dalej.
    const stillWorks = await refreshSession(
      deps,
      staying.refreshToken,
      CONTEXT,
    );

    expect(stillWorks.familyId).toBe(staying.familyId);
  });

  it("nie pozwala wylogowac cudzej sesji", async () => {
    const clock = new TestClock();
    const owner = await registerUser(clock);
    const stranger = await registerUser(clock);

    const ownerSession = await login(
      owner.deps,
      { customerNumber: owner.customerNumber, password: STRONG_PASSWORD },
      CONTEXT,
    );
    const strangerSession = await login(
      stranger.deps,
      { customerNumber: stranger.customerNumber, password: STRONG_PASSWORD },
      CONTEXT,
    );

    const ownerClaims = await owner.deps.accessTokens.verify(
      ownerSession.accessToken,
    );
    const strangerClaims = await stranger.deps.accessTokens.verify(
      strangerSession.accessToken,
    );
    const strangerSessions = await listSessions(stranger.deps, strangerClaims!);

    await expect(
      revokeSession(
        owner.deps,
        ownerClaims!,
        strangerSessions[0]!.id,
        CONTEXT,
      ),
    ).rejects.toThrow(/nie znaleziono/i);
  });

  it("historia logowan zawiera proby udane i nieudane", async () => {
    const clock = new TestClock();
    const { deps, customerNumber } = await registerUser(clock);

    await expect(
      login(deps, { customerNumber, password: "haslo-ktore-nie-pasuje" }, CONTEXT),
    ).rejects.toThrow();

    const session = await login(
      deps,
      { customerNumber, password: STRONG_PASSWORD },
      CONTEXT,
    );
    const claims = await deps.accessTokens.verify(session.accessToken);
    const history = await loginHistory(deps, claims!);

    expect(history.some((entry) => entry.successful)).toBe(true);
    expect(history.some((entry) => !entry.successful)).toBe(true);
    expect(history[0]?.ip).toBe(CONTEXT.ip);
  });

  it("wylogowanie konczy biezaca sesje", async () => {
    const clock = new TestClock();
    const { deps, customerNumber } = await registerUser(clock);

    const session = await login(
      deps,
      { customerNumber, password: STRONG_PASSWORD },
      CONTEXT,
    );
    const claims = await deps.accessTokens.verify(session.accessToken);

    await logout(deps, claims!, CONTEXT);

    await expect(
      refreshSession(deps, session.refreshToken, CONTEXT),
    ).rejects.toThrow();
  });
});

describe("konto demonstracyjne", () => {
  it("loguje jednym strzalem i zwraca jawne dane dostepowe", async () => {
    const clock = new TestClock();
    const deps = testAuthDeps(clock);

    const first = await demoLogin(deps, CONTEXT);

    expect(first.credentials.pin).toBe("1234");
    expect(first.user.isDemo).toBe(true);

    // Drugie klikniecie nie tworzy nowego konta.
    const second = await demoLogin(deps, CONTEXT);

    expect(second.user.id).toBe(first.user.id);
    expect(second.credentials.customerNumber).toBe(
      first.credentials.customerNumber,
    );

    // Logowanie demo idzie normalna sciezka, wiec zostawia zwykly slad w logu.
    const actions = await auditActionsFor(first.user.id);

    expect(actions).toContain(AUTH_ACTIONS.loginSuccess);
  });

  it("PIN demo faktycznie dziala", async () => {
    const clock = new TestClock();
    const deps = testAuthDeps(clock);

    const session = await demoLogin(deps, CONTEXT);
    const claims = await deps.accessTokens.verify(session.accessToken);

    const elevated = await verifyPin(
      deps,
      claims!,
      session.credentials.pin,
      CONTEXT,
    );

    expect(elevated.elevatedUntil.getTime()).toBeGreaterThan(clock.now().getTime());
  });
});

describe("odpornosc na powtorzenia rejestracji", () => {
  it("odrzuca drugi adres e-mail bez tworzenia konta", async () => {
    const clock = new TestClock();
    const deps = testAuthDeps(clock);
    const email = uniqueEmail();

    await register(
      deps,
      { firstName: "A", lastName: "B", email, password: STRONG_PASSWORD },
      CONTEXT,
    );

    const second = register(
      deps,
      { firstName: "C", lastName: "D", email, password: STRONG_PASSWORD },
      CONTEXT,
    );

    await expect(second).rejects.toSatisfy((error: unknown) =>
      isDomainError(error, "EMAIL_TAKEN"),
    );
  });
});

describe("ograniczanie prob z jednego adresu", () => {
  it("odcina adres po trzydziestu nieudanych probach w kwadransie", async () => {
    const clock = new TestClock();
    const deps = testAuthDeps(clock);
    // Wlasny adres, zeby ten test nie zuzywal limitu pozostalym i zeby kolejne
    // uruchomienia zestawu nie sumowaly sie ze soba.
    const context = testContext();

    for (let attempt = 0; attempt < 30; attempt += 1) {
      await expect(
        login(deps, { customerNumber: "00000000", password: "cokolwiek-tu-jest" }, context),
      ).rejects.toThrow(/niepoprawne/i);
    }

    // Trzydziesta pierwsza proba nie dochodzi juz do weryfikacji hasla — inny kod
    // bledu i inny komunikat.
    await expect(
      login(deps, { customerNumber: "00000000", password: "cokolwiek-tu-jest" }, context),
    ).rejects.toThrow(/zbyt wiele/i);

    // Okno jest ruchome: po kwadransie proby wypadaja z zakresu.
    clock.advanceMinutes(16);

    await expect(
      login(deps, { customerNumber: "00000000", password: "cokolwiek-tu-jest" }, context),
    ).rejects.toThrow(/niepoprawne/i);
  });
});
