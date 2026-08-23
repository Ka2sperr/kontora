"use client";

import { useState } from "react";
import { Kwota } from "@/components/kwota";
import { PasekKsiegowy, type ZapisDto } from "@/components/pasek-ksiegowy";
import { Przycisk } from "@/components/ui/pola";
import type { MoneyDto } from "@/http/response";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { formatDateTime } from "@/i18n/format";

export interface PozycjaHistorii {
  readonly id: string;
  readonly title: string;
  readonly counterpartyName: string | null;
  readonly category: string | null;
  readonly merchant: string | null;
  readonly bookedAt: string;
  readonly amount: MoneyDto;
  readonly entries: readonly ZapisDto[];
}

/**
 * Historia operacji z rozwijanym paskiem ksiegowym.
 *
 * Paginacja kursorowa, nie offsetowa: `nextCursor` wskazuje ostatni wpis
 * poprzedniej strony. Przy `OFFSET` dopisanie transakcji miedzy zadaniami
 * przesuwa cala liste o jeden i uzytkownik ogląda ten sam wiersz dwa razy.
 */
export function Historia({
  accountId,
  poczatkowe,
  poczatkowyKursor,
  locale,
  t,
}: {
  readonly accountId: string;
  readonly poczatkowe: readonly PozycjaHistorii[];
  readonly poczatkowyKursor: string | null;
  readonly locale: Locale;
  readonly t: Dictionary;
}) {
  const [pozycje, setPozycje] = useState<readonly PozycjaHistorii[]>(poczatkowe);
  const [kursor, setKursor] = useState<string | null>(poczatkowyKursor);
  const [rozwiniete, setRozwiniete] = useState<ReadonlySet<string>>(new Set());
  const [pracuje, setPracuje] = useState(false);
  const [blad, setBlad] = useState<string | null>(null);

  async function wczytajWiecej(): Promise<void> {
    if (kursor === null) {
      return;
    }

    setPracuje(true);
    setBlad(null);

    try {
      const response = await fetch(
        `/api/accounts/${accountId}/transactions?cursor=${encodeURIComponent(kursor)}&limit=25`,
      );

      if (!response.ok) {
        setBlad(t.bledy.ogolny);

        return;
      }

      const body: {
        data: { items: PozycjaHistorii[]; nextCursor: string | null };
      } = await response.json();

      setPozycje((dotychczas) => [...dotychczas, ...body.data.items]);
      setKursor(body.data.nextCursor);
    } catch {
      setBlad(t.bledy.siec);
    } finally {
      setPracuje(false);
    }
  }

  function przelacz(id: string): void {
    setRozwiniete((poprzednie) => {
      const nastepne = new Set(poprzednie);

      if (nastepne.has(id)) {
        nastepne.delete(id);
      } else {
        nastepne.add(id);
      }

      return nastepne;
    });
  }

  if (pozycje.length === 0) {
    return <p className="py-8 text-sm text-atrament-slaby">{t.konto.pustaHistoria}</p>;
  }

  return (
    <div>
      <ul className="divide-y divide-linia border-y border-linia">
        {pozycje.map((pozycja) => {
          const otwarte = rozwiniete.has(pozycja.id);
          const idPanelu = `zapisy-${pozycja.id}`;

          return (
            <li key={pozycja.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                <span className="flex flex-col">
                  <span className="font-medium">{pozycja.title}</span>
                  <span className="text-xs text-atrament-slaby">
                    {formatDateTime(new Date(pozycja.bookedAt), locale)}
                    {pozycja.counterpartyName === null
                      ? null
                      : ` · ${pozycja.counterpartyName}`}
                    {pozycja.category === null ? null : ` · ${pozycja.category}`}
                  </span>
                </span>
                <span className="flex items-baseline gap-4">
                  <Kwota value={pozycja.amount} locale={locale} signed />
                  {/*
                    Przycisk, nie znacznik `details`. Panel musi byc sterowany
                    stanem, bo `aria-expanded` i `aria-controls` maja odpowiadac
                    temu, co widac — a `details` w Safari nie ogłasza zmiany.
                  */}
                  <button
                    type="button"
                    onClick={() => przelacz(pozycja.id)}
                    aria-expanded={otwarte}
                    aria-controls={idPanelu}
                    className="text-xs text-niebieski underline underline-offset-4"
                  >
                    {otwarte ? t.konto.ukryjZapisy : t.konto.pokazZapisy}
                  </button>
                </span>
              </div>

              {otwarte ? (
                <div id={idPanelu} className="pb-3">
                  <PasekKsiegowy zapisy={pozycja.entries} locale={locale} t={t} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {blad === null ? null : (
        <p role="alert" className="mt-4 text-sm text-stempel">
          {blad}
        </p>
      )}

      {kursor === null ? null : (
        <div className="mt-6">
          <Przycisk
            type="button"
            wariant="drugi"
            onClick={() => void wczytajWiecej()}
            disabled={pracuje}
          >
            {pracuje ? t.wspolne.wczytywanie : t.konto.wczytajWiecej}
          </Przycisk>
        </div>
      )}
    </div>
  );
}
