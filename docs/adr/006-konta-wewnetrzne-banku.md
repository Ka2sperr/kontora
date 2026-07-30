# ADR-006: Konta wewnetrzne banku jako druga strona kazdego zapisu

- **Status:** Zaakceptowany
- **Etap:** 1
- **Data:** 2026-07-30

## Kontekst

Przelew miedzy dwoma klientami tego samego banku bilansuje sie sam: minus u
jednego, plus u drugiego. Klopot zaczyna sie przy kazdej operacji, ktora ma tylko
jedna strone w obrebie klientow:

- przelew na zewnatrz — pieniadze wychodza, ale dokad w ksiedze,
- wplata z zewnatrz — pieniadze przychodza, ale skad,
- przewalutowanie — klient traci euro i dostaje zlote, ktore sie nie skracaja,
- marza banku — kwota, ktorej klient nie dostaje, ale ktora musi gdzies osiasc,
- odsetki i oplaty — jak wyzej.

Kuszace jest potraktowanie takich operacji jako jednostronnych: jeden zapis,
bilans sprawdzany tylko tam, gdzie sie zgadza. To otwiera dziure, przez ktora
niezmiennik przestaje cokolwiek gwarantowac — a niezmiennik z wyjatkami nie jest
niezmiennikiem.

## Rozwazane opcje

1. **Zapisy jednostronne dla operacji zewnetrznych**, z wyjatkiem w regule sumy
   zerowej. Odpada: wyjatek trzeba by zakodowac w wyzwalaczu bazy, ktory przestalby
   wtedy wykrywac prawdziwe bledy.
2. **Jedno konto techniczne "swiat zewnetrzny"** dla wszystkiego. Bilansuje sie,
   ale miesza w jednym worku rozrachunki miedzybankowe, pozycje walutowa i
   przychody z marz — czyli trzy rzeczy, ktore w prawdziwym banku raportuje sie
   osobno i ktore roznia sie znaczeniem.
3. **Zestaw kont wewnetrznych o okreslonych rolach.** Wybrane.

## Decyzja

Kazdy zapis ma pelny komplet stron. Konta wewnetrzne banku (`kind = 'internal'`,
`user_id IS NULL`, `internal_code` wypelniony) sluza jako druga strona:

| Konto | Rola |
|-------|------|
| `BANK_SETTLEMENT_<CCY>` | rozrachunki z bankami zewnetrznymi |
| `BANK_FX_POSITION_<CCY>` | pozycja walutowa banku, jedno konto na walute |
| `BANK_FEE_INCOME_PLN` | przychody z marz i oplat |
| `BANK_CREDIT_LINE_PLN` | finansowanie kart kredytowych |

Powstaja w **migracji**, nie w seederze. Sa czescia struktury, nie danymi
przykladowymi: bez `BANK_SETTLEMENT_PLN` przelew zewnetrzny nie ma drugiej strony i
aplikacja jest niesprawna, a nie uboga w dane. Identyfikatory sa wpisane wprost i
deterministyczne, zeby srodowisko deweloperskie, CI i produkcja mialy te same konta.

Ograniczenie `accounts_owner_matches_kind` pilnuje, ze konto wewnetrzne nie ma
wlasciciela i ma kod, a konto klienta odwrotnie. Bez tego "konto niczyje" byloby
konwencja, ktora zlamie pierwszy `INSERT` napisany w posplechu.

Konta wewnetrzne sa zwolnione ze sprawdzania pokrycia. `BANK_FX_POSITION_EUR` z
ujemnym saldem oznacza krotka pozycje walutowa banku, a nie debet — a `BANK_SETTLEMENT_PLN`
musi obsluzyc pierwszy przelew zewnetrzny w historii systemu, czyli w momencie, gdy
ma saldo zero.

**Odstepstwo od sekcji 5.1 specyfikacji.** Dokument wymienia tylko
`BANK_SETTLEMENT_PLN`. W migracji sa takze wersje EUR i USD, bo klient moze miec
konto walutowe, a przelew zewnetrzny z takiego konta musi wyjsc przez konto
rozrachunkowe w tej samej walucie. Alternatywa byloby odrzucanie operacji z powodu
brakujacego wiersza w tabeli.

## Konsekwencje

- Niezmiennik sumy zerowej nie ma ani jednego wyjatku, wiec wyzwalacz w bazie moze
  byc bezwarunkowy i wykrywac kazdy blad.
- Ksiega banku daje sie czytac jak ksiega: suma wszystkich kont klientow plus suma
  kont wewnetrznych wynosi zero w kazdej walucie. Test sprawdza to na calej tabeli.
- Ekran "pokaz zapisy ksiegowe" pokazuje takze strone bankowa. To element pokazowy:
  rekruter widzi, gdzie faktycznie ladauje marza na przewalutowaniu.
- Dodanie waluty wymaga dopisania kont wewnetrznych w migracji. Swiadomy koszt —
  alternatywa (tworzenie kont w locie) oznaczalaby `INSERT` do `accounts` w srodku
  transakcji pienieznej.
