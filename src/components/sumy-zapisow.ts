import { type Money, add } from "@/domain/money/money";
import { moneyFromDto } from "@/i18n/format";

/**
 * Sumowanie zapisow ksiegowych per waluta — logika paska ksiegowego wyciagnieta z
 * komponentu, zeby dala sie przetestowac bez renderowania.
 *
 * Sumowanie MUSI byc per waluta. Przewalutowanie ma zapisy w dwoch walutach i
 * kazda bilansuje sie osobno; zsumowanie wszystkiego razem daloby liczbe, ktora
 * nie znaczy nic — 100 EUR i 430 PLN nie skracaja sie nawzajem.
 */
export function sumujPerWaluta(
  zapisy: readonly { readonly amount: { readonly amountMinor: string; readonly currency: string } }[],
): ReadonlyMap<string, Money> {
  const sumy = new Map<string, Money>();

  for (const zapis of zapisy) {
    const kwota = moneyFromDto(zapis.amount);
    const dotychczas = sumy.get(kwota.currency);

    sumy.set(kwota.currency, dotychczas === undefined ? kwota : add(dotychczas, kwota));
  }

  return sumy;
}
