import { describe, expect, it } from "vitest";
import { money } from "@/domain/money/money";
import { sumujPerWaluta } from "@/components/sumy-zapisow";
import { dictionaryFor } from "@/i18n/dictionaries";
import { negotiateLocale } from "@/i18n/config";
import {
  formatIban,
  formatMoney,
  formatSignedMoney,
  toDecimalString,
} from "@/i18n/format";

/** Niedzielace spacje, ktorych uzywa Intl — porownanie znak w znak bez nich zawodzi. */
function normalize(value: string): string {
  return value.replace(/[  ]/g, " ");
}

describe("zamiana jednostek minor na ciag dziesietny", () => {
  it("wstawia separator we wlasciwym miejscu", () => {
    expect(toDecimalString(12_345n, "PLN")).toBe("123.45");
    expect(toDecimalString(5n, "PLN")).toBe("0.05");
    expect(toDecimalString(0n, "PLN")).toBe("0.00");
  });

  it("zachowuje znak minus", () => {
    expect(toDecimalString(-12_345n, "PLN")).toBe("-123.45");
    expect(toDecimalString(-5n, "PLN")).toBe("-0.05");
  });

  it("nie traci precyzji powyzej Number.MAX_SAFE_INTEGER", () => {
    // 90 071 992 547 409,93 zl. Ta sama wartosc przepuszczona przez `Number`
    // wrocilaby zaokraglona — i to jest caly powod, dla ktorego ta funkcja
    // istnieje zamiast dzielenia przez sto.
    expect(toDecimalString(9_007_199_254_740_993n, "PLN")).toBe(
      "90071992547409.93",
    );
  });
});

describe("formatowanie kwot", () => {
  it("formatuje po polsku i po angielsku", () => {
    const kwota = money(123_45n, "PLN");

    expect(normalize(formatMoney(kwota, "pl"))).toBe("123,45 zł");
    expect(normalize(formatMoney(kwota, "en"))).toContain("123.45");
  });

  it("zachowuje pelna precyzje duzej kwoty", () => {
    const duza = money(9_007_199_254_740_993n, "PLN");

    // Gdyby po drodze pojawil sie `Number`, ostatnia cyfra bylaby inna.
    expect(normalize(formatMoney(duza, "pl"))).toContain("409,93");
  });

  it("dodaje jawny plus przy uznaniach", () => {
    // Wymog dostepnosci: kwoty dodatnie i ujemne nie moga roznic sie wylacznie
    // kolorem. Znak niesie te sama informacje i dziala przy daltonizmie.
    expect(formatSignedMoney(money(100n, "PLN"), "pl")).toMatch(/^\+/);
    expect(formatSignedMoney(money(-100n, "PLN"), "pl")).toMatch(/^-/);
    expect(formatSignedMoney(money(0n, "PLN"), "pl")).not.toMatch(/^[+-]/);
  });

  it("rozroznia waluty niezaleznie od jezyka", () => {
    // Polskie locale pokazuje euro symbolem, a dolara kodem "USD" — tak stanowi
    // CLDR i nie jest to nasza decyzja. Wazne jest, ze kwota nigdy nie wyswietla
    // sie bez oznaczenia waluty: "100,00" bez kontekstu to w banku wielowalutowym
    // informacja falszywa.
    const euro = formatMoney(money(100_00n, "EUR"), "pl");
    const dolar = formatMoney(money(100_00n, "USD"), "pl");
    const zloty = formatMoney(money(100_00n, "PLN"), "pl");

    expect(euro).toContain("€");
    expect(dolar).toContain("USD");
    expect(zloty).toContain("zł");

    expect(new Set([euro, dolar, zloty]).size).toBe(3);
  });
});

describe("IBAN", () => {
  it("grupuje po cztery znaki", () => {
    expect(formatIban("PL61109010140000071219812874")).toBe(
      "PL61 1090 1014 0000 0712 1981 2874",
    );
  });

  it("radzi sobie z wejsciem juz sformatowanym", () => {
    expect(formatIban("PL61 1090 1014 0000 0712 1981 2874")).toBe(
      "PL61 1090 1014 0000 0712 1981 2874",
    );
  });
});

describe("wybor jezyka", () => {
  it("bierze pierwszy obslugiwany jezyk z naglowka", () => {
    expect(negotiateLocale("en-US,en;q=0.9,pl;q=0.8")).toBe("en");
    expect(negotiateLocale("pl-PL,pl;q=0.9")).toBe("pl");
  });

  it("wraca do polskiego przy jezyku, ktorego nie obslugujemy", () => {
    expect(negotiateLocale("de-DE,de;q=0.9")).toBe("pl");
    expect(negotiateLocale(null)).toBe("pl");
  });
});

describe("slowniki", () => {
  it("maja komplet kluczy w obu jezykach", () => {
    // Typ pilnuje tego w czasie kompilacji; ten test pilnuje, ze zaden klucz nie
    // zostal wypelniony pustym napisem, zeby "przeszlo".
    const pusteKlucze = (dictionary: object, sciezka = ""): string[] =>
      Object.entries(dictionary).flatMap(([key, value]) =>
        typeof value === "string"
          ? value.trim().length === 0
            ? [`${sciezka}${key}`]
            : []
          : pusteKlucze(value as object, `${sciezka}${key}.`),
      );

    expect(pusteKlucze(dictionaryFor("pl"))).toEqual([]);
    expect(pusteKlucze(dictionaryFor("en"))).toEqual([]);
  });

  it("nie zmienia dosłownej tresci banera z sekcji 14", () => {
    expect(dictionaryFor("pl").baner.tytul).toBe("Aplikacja demonstracyjna.");
    expect(dictionaryFor("pl").baner.tresc).toContain(
      "Brak realnych pieniedzy.",
    );
  });
});

describe("sumy paska ksiegowego", () => {
  it("przelew wewnetrzny sumuje sie do zera", () => {
    const sumy = sumujPerWaluta([
      { amount: { amountMinor: "-10000", currency: "PLN" } },
      { amount: { amountMinor: "10000", currency: "PLN" } },
    ]);

    expect(sumy.get("PLN")?.amountMinor).toBe(0n);
  });

  it("przewalutowanie bilansuje sie osobno w kazdej walucie", () => {
    // Przyklad z sekcji 5.1: 100 EUR na PLN po kursie 4,3000 z marza 1,5%.
    // Zsumowane razem daloby 42 000 — i wlasnie dlatego suma liczy sie per waluta.
    const sumy = sumujPerWaluta([
      { amount: { amountMinor: "-10000", currency: "EUR" } },
      { amount: { amountMinor: "10000", currency: "EUR" } },
      { amount: { amountMinor: "42355", currency: "PLN" } },
      { amount: { amountMinor: "645", currency: "PLN" } },
      { amount: { amountMinor: "-43000", currency: "PLN" } },
    ]);

    expect(sumy.get("EUR")?.amountMinor).toBe(0n);
    expect(sumy.get("PLN")?.amountMinor).toBe(0n);
    expect([...sumy.keys()].sort()).toEqual(["EUR", "PLN"]);
  });

  it("nie traci precyzji na duzych kwotach", () => {
    const sumy = sumujPerWaluta([
      { amount: { amountMinor: "9007199254740993", currency: "PLN" } },
      { amount: { amountMinor: "1", currency: "PLN" } },
    ]);

    expect(sumy.get("PLN")?.amountMinor).toBe(9_007_199_254_740_994n);
  });

  it("pusty zestaw nie ma zadnej waluty", () => {
    expect(sumujPerWaluta([]).size).toBe(0);
  });
});
