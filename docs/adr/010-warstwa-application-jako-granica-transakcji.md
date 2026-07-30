# ADR-010: Warstwa application jako granica transakcji

- **Status:** Zaakceptowany
- **Etap:** 0
- **Data:** 2026-07-30

## Kontekst

Dwie reguly specyfikacji stoja wobec siebie w napieciu:

- **Regula 6** — kazdy ruch pieniedzy dzieje sie serwerowo, w jednej transakcji bazy
  danych, z `SELECT ... FOR UPDATE` na kontach w rosnacej kolejnosci ID.
- **Regula 7** — logika domenowa w `src/domain/` nie importuje niczego z Next.js ani
  Drizzle i daje sie testowac bez bazy.

Transakcja i blokada wierszy to pojecia silnika bazy. Gdyby domena je znala,
zlamalaby regule 7. Gdyby ich nie znal nikt powyzej repozytorium, przelew skladalby
sie z kilku niezaleznych transakcji i regula 6 przestalaby obowiazywac.

Dodatkowo kolejnosc blokowania po rosnacym ID nie jest zasada bankowa. Bank nie ma
zdania o tym, ktore konto blokowac pierwsze. To technika unikania zakleszczen w
silniku, ktory blokuje wiersze — czyli wiedza infrastruktury, nie domeny.

## Rozwazane opcje

1. **Transakcja w Route Handlerze.** Kazdy endpoint pamieta o `db.transaction()`.
   Dziala do pierwszego zapomnienia, a zapomnienie objawia sie utrata pieniedzy pod
   obciazeniem, nie bledem kompilacji.
2. **Transakcja w repozytorium.** Repozytorium konta nie wie nic o repozytorium ksiegi,
   wiec przelew rozpada sie na dwie transakcje. Odpada.
3. **Port `UnitOfWork` w domenie, implementacja w infrastrukturze, uzycie w
   application.** Wybrane.

## Decyzja

Granica transakcji lezy w `src/application/`. Przypadek uzycia jest jedynym miejscem,
ktore ja otwiera i zamyka:

```ts
// src/domain/ports/unit-of-work.ts  — interfejs, zero importow z Drizzle
export interface UnitOfWork {
  run<T>(work: (repos: Repositories) => Promise<T>): Promise<T>;
}
```

Implementacja w `src/infrastructure/db/` opakowuje `db.transaction()` i wstrzykuje do
callbacku repozytoria zwiazane z ta konkretna transakcja. Domena widzi tylko
interfejs; slowo "transakcja" w sensie bazodanowym nie pojawia sie w `src/domain/`
poza nazwa portu.

Trzy elementy tego rozwiazania warte podkreslenia:

**Kolejnosc blokad nalezy do adaptera.** Metoda repozytorium ma sygnature
`lockAccounts(ids: readonly AccountId[]): Promise<LockedAccount[]>` i sortuje ID
rosnaco wewnatrz, przed `FOR UPDATE`. Wolajacy nie musi o tym pamietac, bo nie
powinien o tym wiedziec.

**Blokada jest widoczna w typie.** `LockedAccount` to typ oznaczony (branded),
ktorego nie da sie utworzyc poza repozytorium. Funkcja domenowa liczaca przelew
przyjmuje wylacznie `LockedAccount`, wiec podanie konta odczytanego zwyklym
`findById` nie kompiluje sie. Zapomnienie o blokadzie przestaje byc bledem czasu
wykonania widocznym tylko pod obciazeniem, a staje sie bledem kompilacji.

**Idempotencja opiera sie o baze, nie o sprawdzenie w kodzie.** `UNIQUE` na
`transactions.idempotency_key`. Sekwencja "sprawdz, czy klucz istnieje, potem wstaw"
ma okno wyscigu miedzy sprawdzeniem a wstawieniem — przy dwoch rownoleglych
zadaniach z tym samym kluczem oba moga przejsc sprawdzenie. Adapter przechwytuje
naruszenie unikalnosci (SQLSTATE 23505) i tlumaczy je na domenowy
`IdempotencyConflict`, po czym przypadek uzycia zwraca oryginalny wynik.

## Konsekwencje

- Test przelewu dziala na atrapie `UnitOfWork`, ktora po prostu wola callback. Zero
  bazy, milisekundy zamiast sekund.
- Test wspolbieznosci (200 rownoleglych przelewow, Etap 1) dziala na prawdziwym
  Postgresie i jest jedynym miejscem, ktore weryfikuje kolejnosc blokad. Dlatego
  konfiguracja integracyjna ma `fileParallelism: false`, a `docker-compose.yml`
  podnosi `max_connections` do 300 — przy domyslnych 100 test przewrocilby sie na
  wyczerpaniu polaczen i wygladalby na blad zakleszczenia, ktorym nie jest.
- Application jest cienka i pozostanie cienka: otwiera transakcje, wola domene, mapuje
  bledy. Jesli zacznie zawierac regule biznesowa, regula jest w zlym miejscu.
- Kazda operacja zmieniajaca stan przechodzi przez `UnitOfWork`, takze taka, ktora
  dotyka jednej tabeli. Jednolitosc jest tu wazniejsza niz oszczednosc jednego
  `BEGIN`, bo wyjatek od reguly to miejsce, w ktorym nastepna osoba dopisze druga
  operacje bez transakcji.
