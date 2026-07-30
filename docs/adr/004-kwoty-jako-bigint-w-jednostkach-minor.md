# ADR-004: Kwoty jako BIGINT w jednostkach minor

- **Status:** Zaakceptowany
- **Etap:** 0
- **Data:** 2026-07-30

## Kontekst

Regula 1 specyfikacji: kwoty wylacznie jako `BIGINT` w jednostkach minor, osobna
kolumna `currency` (ISO 4217), zero arytmetyki na `float`/`Number`, formatowanie
tylko przez `Intl.NumberFormat` w warstwie prezentacji.

Powod jest arytmetyczny, nie stylistyczny. `0.1 + 0.2 !== 0.3` w IEEE 754, a w
ksiedze podwojnego zapisu taki blad nie zostaje w jednym miejscu — psuje niezmiennik
"suma wpisow transakcji rowna sie zero", ktory jest jedyna rzecza odrozniajaca
ksiege od tabeli z liczbami.

Sam `bigint` w kodzie to jednak za malo. Kwota bez waluty nie jest kwota, tylko
liczba, a `10000` moze byc rownie dobrze 100 PLN, jak 100 EUR. Dodanie jednego do
drugiego musi byc bledem, nie cicha suma.

## Rozwazane opcje

1. **`number` w jednostkach major (`123.45`).** Odpada z definicji.
2. **`number` w jednostkach minor (`12345`).** Poprawne az do `2^53`, czyli do okolo
   90 miliardow zlotych. Wystarczy dla demo, ale bezpieczenstwo bierze sie z tego,
   ze nikt nie wpisal wiekszej liczby, a nie z typu. Odpada.
3. **Biblioteka (`dinero.js`, `big.js`).** Dziala, ale wciaga zewnetrzna zaleznosc do
   `src/domain/`, czyli do warstwy, ktora ma byc wolna od zaleznosci. Przy tak malym
   zakresie operacji (dodaj, odejmij, neguj, porownaj, sumuj) koszt wlasnej
   implementacji jest nizszy niz koszt utrzymywania zaleznosci w rdzeniu.
4. **`bigint` + jawna waluta w typie `Money`.** Wybrane.

## Decyzja

```ts
interface Money {
  readonly amountMinor: bigint;
  readonly currency: Currency;
}
```

- Operacje `add`, `subtract`, `compare` sprawdzaja zgodnosc walut i rzucaja
  `DomainError("CURRENCY_MISMATCH")`. Mieszanie walut jest bledem domenowym, nie
  bledem walidacji formularza.
- `sum(values, currency)` przyjmuje walute jawnie, a nie odczytuje jej z pierwszego
  elementu. Bez tego suma pustego zbioru bylaby niezdefiniowana, a niezmiennik ksiegi
  brzmi "suma per waluta rowna sie zero" i musi dawac odpowiedz takze dla waluty,
  ktora w danej transakcji nie wystepuje.
- Wykladnik jednostki minor pochodzi z tablicy `MINOR_UNIT_EXPONENTS`, nie ze stalej
  `100`. Dzis wszystkie osiem obslugiwanych walut ma wykladnik 2, ale ISO 4217 zna
  waluty zerocyfrowe (JPY) i trzycyfrowe (KWD, BHD). Twarde `100` w kodzie oznacza,
  ze dodanie JPY jest polowaniem po repozytorium zamiast wpisem w tablicy.
- Na granicy bazy: `types: { bigint: postgres.BigInt }` w konfiguracji postgres.js.
  Domyslnie sterownik zwraca `int8` jako `string`, zeby nie stracic precyzji. To
  ostrozne, ale niebezpieczne inaczej: `string` przechodzi przez `Number()` bez
  ostrzezenia i traci precyzje dopiero przy duzych kwotach, czyli w produkcji, a nie
  w tescie. Niech sterownik zwraca `bigint`, a proba potraktowania go jak `number`
  wybuchnie natychmiast.
- `parseFloat` jest zablokowany w `src/domain/**` przez `no-restricted-globals`.

## Konsekwencje

- `JSON.stringify` nie serializuje `bigint` — rzuca `TypeError`. To dobrze: wymusza
  swiadomy serializer na granicy HTTP (kwota jako string w jednostkach minor plus
  kod waluty), zamiast przypadkowego przejscia przez `number` w drodze do przegladarki.
- W testach kwoty zapisuje sie z sufiksem `n` (`10_000n`). Wymaga to `target: ES2022`
  w `tsconfig.json` — literaly `bigint` nie kompiluja sie ponizej ES2020.
- Arytmetyka mieszana `bigint` z `number` jest bledem TypeScriptu, wiec przypadkowe
  `amountMinor * 1.23` (na przyklad przy przeliczaniu kursu) nie skompiluje sie.
  Przeliczenia walutowe z Etapu 5 musza wiec jawnie zdefiniowac zaokraglenie —
  dokladnie tam, gdzie ta decyzja powinna byc widoczna.
- Test w `tests/domain/money.test.ts` sprawdza kwote powyzej `Number.MAX_SAFE_INTEGER`
  i asercja pokazuje, ze ten sam rachunek na `number` dalby zly wynik. Test broni
  wiec decyzji, a nie tylko implementacji.
