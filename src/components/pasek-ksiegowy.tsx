import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { formatMoney, moneyFromDto } from "@/i18n/format";
import { sumujPerWaluta } from "@/components/sumy-zapisow";
import type { MoneyDto } from "@/http/response";

/**
 * ELEMENT SIGNATURE (sekcja 10, Etap 3).
 *
 * Miniaturowy arkusz ksiegi rozwijany w miejscu pod wierszem historii: kolumna
 * obciazen po lewej, uznan po prawej, pod nimi podwojna linia i suma — zawsze
 * zero.
 *
 * Podwojna linia nad suma to konwencja z prawdziwej ksiegowosci i to po niej ten
 * interfejs ma byc zapamietany. Pokazuje w dwie sekundy to, co cala reszta
 * projektu udowadnia kodem: kazda operacja ma dwie strony, ktore sie znosza.
 *
 * Dlatego to nie jest widok diagnostyczny schowany za flaga — jest widoczny,
 * dostepny z klawiatury i opisany zdaniem, ktore tlumaczy, co znaczy zero.
 */

export interface ZapisDto {
  readonly accountId: string;
  readonly accountName: string;
  readonly amount: MoneyDto;
}

export function PasekKsiegowy({
  zapisy,
  locale,
  t,
}: {
  readonly zapisy: readonly ZapisDto[];
  readonly locale: Locale;
  readonly t: Dictionary;
}) {
  const sumy = sumujPerWaluta(zapisy);

  return (
    <div className="border-t border-linia bg-papier-wglebienie px-4 py-3">
      <table className="w-full text-sm">
        <caption className="sr-only">{t.konto.pokazZapisy}</caption>
        <thead>
          <tr className="text-xs uppercase tracking-wide text-atrament-slaby">
            <th scope="col" className="py-1 text-left font-medium">
              &nbsp;
            </th>
            <th scope="col" className="py-1 text-right font-medium">
              {t.konto.obciazenia}
            </th>
            <th scope="col" className="py-1 text-right font-medium">
              {t.konto.uznania}
            </th>
          </tr>
        </thead>
        <tbody>
          {zapisy.map((zapis, index) => {
            const kwota = moneyFromDto(zapis.amount);
            const obciazenie = kwota.amountMinor < 0n;

            return (
              <tr
                key={`${zapis.accountId}-${index}`}
                className="border-t border-linia/60"
              >
                <th scope="row" className="py-1.5 text-left font-normal">
                  {zapis.accountName}
                </th>
                <td className="kwota py-1.5 text-right text-stempel">
                  {obciazenie
                    ? formatMoney(
                        { ...kwota, amountMinor: -kwota.amountMinor },
                        locale,
                      )
                    : null}
                </td>
                <td className="kwota py-1.5 text-right text-zielen">
                  {obciazenie ? null : formatMoney(kwota, locale)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          {[...sumy.entries()].map(([waluta, suma]) => (
            <tr
              key={waluta}
              /*
               * Podwojna linia: dwa obramowania na jednym wierszu, rozdzielone
               * odstepem. To ten detal, ktory odroznia arkusz ksiegowy od zwyklej
               * tabeli — i jedyne miejsce w calym interfejsie, gdzie linia jest
               * podwojna.
               */
              className="border-t-[3px] border-double border-atrament"
            >
              <th scope="row" className="py-2 text-left font-medium">
                {t.konto.suma}
              </th>
              <td colSpan={2} className="kwota py-2 text-right font-medium">
                {formatMoney(suma, locale)}
              </td>
            </tr>
          ))}
        </tfoot>
      </table>
      <p className="mt-2 text-xs text-atrament-slaby">{t.konto.sumaOpis}</p>
    </div>
  );
}
