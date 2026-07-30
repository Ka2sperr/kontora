# ADR-005: Pessimistic locking zamiast optimistic dla ruchu pieniedzy

- **Status:** Zaakceptowany
- **Etap:** 1
- **Data:** 2026-07-30

## Kontekst

Dwa rownolegle przelewy z tego samego konta moga oba przeczytac saldo 100 zl,
oba stwierdzic, ze stac je na 100 zl, i oba sie zaksiegowac. Konto konczy na
minus 100 zl mimo braku limitu kredytowego.

To nie jest przypadek egzotyczny. Wystarczy dwukrotne klikniecie przycisku albo
ponowienie zadania przez klienta mobilnego po utracie zasiegu.

## Rozwazane opcje

1. **Blokada optymistyczna** — kolumna `version` na koncie, `UPDATE ... WHERE
   version = ?`, ponowienie przy przegranej. Dziala i skaluje sie lepiej przy
   niskim poziomie kolizji. Ale: kazde ponowienie musi przejsc cala sciezke od
   nowa, wiec logika ponowien staje sie czescia kazdej operacji pienieznej. Kod
   ponowien jest z natury slabo przetestowany, bo w normalnym dzialaniu sie nie
   wykonuje. Do tego przy koncie z duzym ruchem (a takie jest konto rozrachunkowe
   banku, dotykane przez kazdy przelew zewnetrzny) poziom kolizji nie jest niski —
   i blokada optymistyczna degeneruje sie w petle ponowien.
2. **Blokada pesymistyczna** — `SELECT ... FOR UPDATE` na kontach w rosnacej
   kolejnosci identyfikatorow, wewnatrz jednej transakcji. Wybrane.
3. **Serializowalny poziom izolacji** — Postgres sam wykrywa konflikt i przerywa
   jedna z transakcji. Elegancko, ale przenosi problem: teraz trzeba obsluzyc
   blad serializacji, czyli znowu petle ponowien, tylko w innym miejscu.

## Decyzja

Opcja 2. Kazda operacja pieniezna otwiera transakcje, blokuje wiersze wszystkich
uczestniczacych kont jednym zapytaniem `SELECT ... WHERE id = ANY(...) ORDER BY id
FOR UPDATE`, i dopiero potem liczy cokolwiek.

Trzy szczegoly, w ktorych mieszka poprawnosc:

**Kolejnosc.** `ORDER BY id` przed `FOR UPDATE`. W planie zapytania wezel LockRows
stoi nad sortowaniem, wiec wiersze sa blokowane w kolejnosci posortowanej. Gdy dwa
przelewy dotykaja tej samej pary kont w przeciwnych kierunkach, oba siegaja po nie
w tej samej kolejnosci — jeden czeka, zamiast czekac wzajemnie na siebie.

**Jedno zapytanie na komplet kont.** Blokowanie w dwoch krokach — najpierw konto
rozrachunkowe, potem zrodlowe — narzucaloby kolejnosc kodu zamiast kolejnosci
identyfikatorow i przywracaloby ryzyko zakleszczenia. Dlatego przelew zewnetrzny
najpierw ustala identyfikator konta rozrachunkowego bez blokady, a dopiero potem
blokuje oba konta naraz.

**Blokada widoczna w typie.** `lockByIds` zwraca `LockedAccount` — typ oznaczony,
ktorego nie da sie wytworzyc poza repozytorium. Funkcje domenowe liczace przelew
przyjmuja wylacznie `LockedAccount`, wiec podanie im konta odczytanego zwyklym
`findById` nie przechodzi kompilacji. Zapomniana blokada przestaje byc bledem
widocznym dopiero pod obciazeniem i staje sie bledem kompilacji.

Poziom izolacji zostaje domyslny (READ COMMITTED). Przy blokadzie pesymistycznej
SERIALIZABLE nie dokladalby bezpieczenstwa, a dokladalby bledow serializacji do
obslugi.

## Konsekwencje

- Konto o duzym ruchu jest punktem serializacji. Przelewy z tego samego konta
  ustawiaja sie w kolejce. Dla banku demonstracyjnego to wlasciwe zachowanie:
  poprawnosc przed przepustowoscia.
- Dlugosc transakcji staje sie istotna. Nic, co czeka na siec (kurs NBP, HIBP),
  nie moze sie znalezc miedzy blokada a zatwierdzeniem — inaczej cudzy timeout
  zamienia sie w nasza blokade. Kurs jest pobierany przed otwarciem transakcji i
  wchodzi do niej jako `fx_rate_id`.
- Dowodem jest test: 200 rownoleglych przelewow, po 100 w kazda strone miedzy ta
  sama para kont (`tests/concurrency/parallel-transfers.test.ts`). Kierunek jest
  tu istotny. Przy przelewach idacych tylko w jedna strone kolejnosc blokowania nie
  ma znaczenia i test przechodzilby takze bez `ORDER BY id`, czyli nie sprawdzalby
  niczego.
