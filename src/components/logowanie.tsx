"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Komunikat, Pole, Przycisk } from "@/components/ui/pola";
import type { Dictionary } from "@/i18n/dictionaries";

/**
 * Trzyetapowe logowanie z sekcji 6.1.
 *
 * Etapy sa pokazane, a nie pominiete — takze przy logowaniu demo. Rekruter ma
 * zobaczyc caly przeplyw uwierzytelniania, wiec przycisk demo wypelnia pola i
 * przeprowadza przez kroki, zamiast wrzucac od razu na pulpit (sekcja 11).
 *
 * Krok PIN-u jest tu **informacyjny**: PIN nie loguje, tylko podnosi sesje przy
 * operacji (ADR-002). Ekran mowi to wprost, bo uzytkownik, ktory zobaczy pole
 * PIN-u w logowaniu i nie bedzie musial go wypelnic, uzna to za usterke.
 */

interface DaneDemo {
  readonly customerNumber: string;
  readonly password: string;
  readonly pin: string;
}

type Krok = 1 | 2 | 3;

async function czytajBlad(response: Response, domyslny: string): Promise<string> {
  try {
    const body: unknown = await response.json();
    const message = (body as { error?: { message?: unknown } }).error?.message;

    return typeof message === "string" ? message : domyslny;
  } catch {
    return domyslny;
  }
}

export function Logowanie({ t }: { readonly t: Dictionary }) {
  const router = useRouter();

  const [krok, setKrok] = useState<Krok>(1);
  const [numer, setNumer] = useState("");
  const [haslo, setHaslo] = useState("");
  const [demo, setDemo] = useState<DaneDemo | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [pracuje, setPracuje] = useState(false);

  async function zaloguj(customerNumber: string, password: string): Promise<void> {
    setPracuje(true);
    setBlad(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ customerNumber, password }),
      });

      if (!response.ok) {
        setBlad(await czytajBlad(response, t.bledy.ogolny));
        setKrok(2);

        return;
      }

      setKrok(3);
      // Odswiezenie zamiast `push`: sesja mieszka w ciasteczku httpOnly, wiec to
      // serwer musi zbudowac widok od nowa, znajac juz zalogowanego uzytkownika.
      router.replace("/pulpit");
      router.refresh();
    } catch {
      setBlad(t.bledy.siec);
    } finally {
      setPracuje(false);
    }
  }

  async function zalogujDemo(): Promise<void> {
    setPracuje(true);
    setBlad(null);

    try {
      const response = await fetch("/api/auth/demo-login", { method: "POST" });

      if (!response.ok) {
        setBlad(await czytajBlad(response, t.bledy.ogolny));

        return;
      }

      const body: { data: { credentials: DaneDemo } } = await response.json();

      // Dane demo sa jawne i widoczne, a pola wypelniaja sie na oczach
      // uzytkownika — chodzi o pokazanie przeplywu, nie o jego ominiecie.
      setDemo(body.data.credentials);
      setNumer(body.data.credentials.customerNumber);
      setHaslo(body.data.credentials.password);
      setKrok(3);

      router.replace("/pulpit");
      router.refresh();
    } catch {
      setBlad(t.bledy.siec);
    } finally {
      setPracuje(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <ol className="flex gap-2 text-xs uppercase tracking-wide text-atrament-slaby">
        {[t.logowanie.krokNumer, t.logowanie.krokHaslo, t.logowanie.krokPin].map(
          (etykieta, index) => {
            const numerKroku = (index + 1) as Krok;
            const aktywny = numerKroku === krok;

            return (
              <li
                key={etykieta}
                aria-current={aktywny ? "step" : undefined}
                className={`border-b-2 pb-1 ${
                  aktywny ? "border-niebieski text-atrament" : "border-transparent"
                }`}
              >
                {numerKroku}. {etykieta}
              </li>
            );
          },
        )}
      </ol>

      {blad === null ? null : <Komunikat tresc={blad} />}

      {krok === 1 ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setKrok(2);
          }}
        >
          <Pole
            label={t.logowanie.numerKlienta}
            hint={t.logowanie.numerKlientaOpis}
            value={numer}
            onChange={(event) => setNumer(event.target.value)}
            inputMode="numeric"
            autoComplete="username"
            pattern="\d{8}"
            required
          />
          <Przycisk type="submit" disabled={pracuje}>
            {t.wspolne.dalej}
          </Przycisk>
        </form>
      ) : null}

      {krok === 2 ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void zaloguj(numer, haslo);
          }}
        >
          <p className="text-sm text-atrament-slaby">
            {t.logowanie.numerKlienta}: <strong className="kwota">{numer}</strong>
          </p>
          <Pole
            label={t.logowanie.haslo}
            type="password"
            value={haslo}
            onChange={(event) => setHaslo(event.target.value)}
            autoComplete="current-password"
            required
          />
          <div className="flex gap-2">
            <Przycisk type="submit" disabled={pracuje}>
              {pracuje ? t.wspolne.wczytywanie : t.wspolne.zaloguj}
            </Przycisk>
            <Przycisk
              type="button"
              wariant="drugi"
              onClick={() => setKrok(1)}
              disabled={pracuje}
            >
              {t.wspolne.wstecz}
            </Przycisk>
          </div>
        </form>
      ) : null}

      {krok === 3 ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm">{t.logowanie.pinOpis}</p>
          <p className="text-sm text-atrament-slaby">{t.wspolne.wczytywanie}</p>
        </div>
      ) : null}

      <div className="border-t border-linia pt-6">
        <Przycisk
          type="button"
          wariant="drugi"
          onClick={() => void zalogujDemo()}
          disabled={pracuje}
        >
          {t.logowanie.zalogujDemo}
        </Przycisk>
        <p className="mt-2 text-xs text-atrament-slaby">{t.logowanie.demoOpis}</p>

        {demo === null ? null : (
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-atrament-slaby">{t.logowanie.demoNumer}</dt>
            <dd className="kwota">{demo.customerNumber}</dd>
            <dt className="text-atrament-slaby">{t.logowanie.demoHaslo}</dt>
            <dd className="kwota">{demo.password}</dd>
            <dt className="text-atrament-slaby">{t.logowanie.demoPin}</dt>
            <dd className="kwota">{demo.pin}</dd>
          </dl>
        )}
      </div>
    </div>
  );
}
