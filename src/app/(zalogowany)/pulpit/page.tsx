import Link from "next/link";
import { redirect } from "next/navigation";
import { wymagajSesji } from "@/app/sesja";
import { Kwota, KwotaGlowna } from "@/components/kwota";
import { moneyDto } from "@/http/response";
import { accountQueries } from "@/infrastructure/container";
import { currentDictionary } from "@/i18n/server";
import { formatIban } from "@/i18n/format";
import { sum } from "@/domain/money/money";

export const dynamic = "force-dynamic";

export default async function Pulpit() {
  const sesja = await wymagajSesji();

  if (sesja === null) {
    redirect("/");
  }

  const { locale, t } = await currentDictionary();
  const konta = await accountQueries.listForUser(sesja.userId);

  /*
   * Laczne saldo liczone wylacznie z kont zlotowych.
   *
   * Przeliczenie kont walutowych po biezacym kursie wymaga tabeli NBP, ktora
   * powstaje w Etapie 5. Pokazanie do tego czasu sumy udajacej "wszystko razem"
   * byloby liczba falszywa — wiec zamiast tego liczymy to, co da sie policzyc
   * uczciwie, i mowimy wprost, czego brakuje.
   */
  const zlotowki = konta.filter((konto) => konto.currency === "PLN");
  const razem = sum(
    zlotowki.map((konto) => konto.balance),
    "PLN",
  );

  const maWalutowe = konta.length > zlotowki.length;

  return (
    <main className="py-8">
      <h1 className="sr-only">{t.pulpit.tytul}</h1>

      <section aria-labelledby="laczne-saldo" className="border-b border-linia pb-8">
        <h2
          id="laczne-saldo"
          className="text-xs uppercase tracking-wide text-atrament-slaby"
        >
          {t.pulpit.laczneSaldo}
        </h2>
        <p className="mt-2">
          <KwotaGlowna value={moneyDto(razem)} locale={locale} />
        </p>
        {maWalutowe ? (
          <p className="mt-2 text-sm text-atrament-slaby">
            Suma obejmuje wylacznie konta w PLN. Przeliczanie walut po kursie NBP
            pojawi sie razem z modulem wymiany.
          </p>
        ) : null}
      </section>

      <section aria-labelledby="twoje-konta" className="py-8">
        <h2 id="twoje-konta" className="font-naglowek text-xl">
          {t.pulpit.twojeKonta}
        </h2>

        {konta.length === 0 ? (
          <p className="mt-4 text-sm text-atrament-slaby">{t.wspolne.brakDanych}</p>
        ) : (
          <ul className="mt-4 divide-y divide-linia border-y border-linia">
            {konta.map((konto) => (
              <li key={konto.id}>
                <Link
                  href={`/konto/${konto.id}`}
                  className="flex flex-wrap items-baseline justify-between gap-2 py-4
                             hover:bg-papier-wglebienie"
                >
                  <span className="flex flex-col">
                    <span className="font-medium">{konto.displayName}</span>
                    <span className="text-xs text-atrament-slaby">
                      {t.konta[konto.kind]}
                      {konto.iban === null ? null : ` · ${formatIban(konto.iban)}`}
                    </span>
                  </span>
                  <span className="flex flex-col items-end">
                    <Kwota value={moneyDto(konto.balance)} locale={locale} />
                    {konto.creditLimit === null ? null : (
                      <span className="text-xs text-atrament-slaby">
                        {t.konto.limitKredytowy}:{" "}
                        <Kwota
                          value={moneyDto(konto.creditLimit)}
                          locale={locale}
                          className="text-xs"
                        />
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
