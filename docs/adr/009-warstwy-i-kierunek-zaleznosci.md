# ADR-009: Warstwy i kierunek zaleznosci

- **Status:** Zaakceptowany
- **Etap:** 0
- **Data:** 2026-07-30

## Kontekst

Regula 7 specyfikacji wymaga, by logika domenowa w `src/domain/` nie importowala
niczego z Next.js ani Drizzle, dostep do danych szedl przez interfejsy repozytoriow,
a calosc dala sie testowac bez bazy i bez frameworka.

Sama deklaracja w README tego nie zapewnia. W projekcie, ktory rosnie przez osiem
etapow, granica utrzymuje sie wylacznie wtedy, gdy jej naruszenie psuje build.
Typowy scenariusz przeciekania jest niewinny: ktos potrzebuje w domenie typu
`InferSelectModel` z Drizzle, bo "to tylko typ". Od tego momentu ksztalt tabeli
dyktuje ksztalt modelu domenowego i odwrocenie tego kosztuje przepisanie warstwy.

## Rozwazane opcje

1. **Konwencja opisana w README.** Zero narzutu, zero egzekwowania. Odpada — regula
   bez egzekwowania to zyczenie.
2. **Osobne pakiety w monorepo (pnpm workspaces).** Granica staje sie fizyczna:
   `@kontora/domain` po prostu nie ma Drizzle w swoich zaleznosciach. Egzekwowanie
   najmocniejsze z mozliwych, ale koszt jest realny — konfiguracja buildu, mapowanie
   sciezek, wolniejszy start w Vercel, a przede wszystkim trudniejszy odbior projektu
   portfolio przez osobe, ktora chce w piec minut zobaczyc, gdzie co jest.
3. **Jeden pakiet, granica egzekwowana przez lint i test architektury.** Struktura
   katalogow plus regula `no-restricted-imports` per katalog plus test czytajacy
   faktyczne importy przez parser TypeScriptu.

## Decyzja

Opcja 3. Cztery warstwy, zaleznosci wylacznie do srodka:

```
app / http  →  application  →  domain
infrastructure  →  domain          (implementuje porty)
```

- `src/domain/` — encje, wartosci, niezmienniki, porty (interfejsy). Zero importow
  z `next`, `react`, `drizzle-orm`, `postgres`, `argon2` i zero importow z warstw
  zewnetrznych.
- `src/application/` — przypadki uzycia, orkiestracja, granica transakcji. Widzi
  `domain`, nie widzi frameworka ani sterownika bazy.
- `src/infrastructure/` — adaptery: Drizzle, postgres.js, zegar, generator ID, NBP.
- `src/http/` i `src/app/` — Route Handlers, Server Actions, komponenty.

Egzekwowanie na dwa niezalezne sposoby:

- **ESLint** — `no-restricted-imports` z osobnymi blokami dla `src/domain/**` i
  `src/application/**`. Uzywam reguly rdzeniowej, nie `eslint-plugin-import`, bo
  `eslint-config-next` rejestruje juz plugin `import` i ponowna rejestracja w flat
  configu konczy sie bledem konfiguracji.
- **Test architektury** (`tests/architecture/domain-purity.test.ts`) — czyta importy
  przez `ts.preProcessFile`, wiec widzi rowniez `export ... from`, `import()` i
  `require()`, a nie widzi tekstu w komentarzach. Test ma wlasny blok kontroli
  pozytywnej: sprawdza, ze straznik faktycznie odrzuca podsunieta mu sciezke do
  `@/infrastructure/db/client`. Bez tego zielony wynik moglby oznaczac po prostu,
  ze straznik niczego nie sprawdza.

Dwa mechanizmy, bo lint da sie wyciszyc komentarzem w jednej linii, a test
architektury nie.

## Konsekwencje

- Naruszenie granicy jest czerwone lokalnie i w CI, zanim trafi do przegladu.
- Dodanie nowej warstwy wymaga aktualizacji w dwoch miejscach (config lintu i tablica
  `LAYER_RULES` w tescie). Akceptowalny koszt przy czterech warstwach.
- Domena nie moze uzywac `Date.now()` ani `crypto.randomUUID()` bezposrednio — stad
  porty `Clock` i `IdGenerator`. To nie jest ceremonia: bez nich test piecio­minutowej
  sesji podniesionej wymagalby czekania piec minut.
- Mapowanie miedzy wierszem bazy a encja domenowa trzeba napisac recznie w adapterze.
  Swiadomie placony koszt: to wlasnie ten kod, ktory chroni domene przed ksztaltem
  schematu.
