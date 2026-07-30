# ADR-011: Lancuch skrotow logu audytu

- **Status:** Zaakceptowany
- **Etap:** 1
- **Data:** 2026-07-30

## Kontekst

Log audytu, ktory da sie po cichu zmienic, jest gorszy niz brak logu: daje falszywe
poczucie, ze przeszlosc jest udokumentowana. Wyzwalacz blokujacy UPDATE i DELETE
chroni przed aplikacja, ale nie przed kims, kto ma dostep do bazy — a taki ktos
wylaczy wyzwalacz jednym poleceniem.

Log audytu powstaje w tym etapie, choc specyfikacja umieszcza go w Etapie 2. Powod
jest prosty: definicja ukonczenia Etapu 1 wymaga wszystkich szesciu krytycznych
testow z sekcji 12, a szosty sprawdza wykrywanie manipulacji w logu.

## Rozwazane opcje

1. **Sam wyzwalacz append-only.** Chroni przed bledem w aplikacji, nie chroni przed
   dostepem do bazy. Zostaje jako pierwsza warstwa, ale nie wystarcza.
2. **Podpis kryptograficzny kazdego wpisu.** Mocniejsze, ale klucz prywatny musi
   gdzies byc — a jest tam, gdzie baza, wiec kto ma jedno, siega po drugie. Zysk
   pozorny przy tym modelu zagrozen.
3. **Lancuch skrotow.** Kazdy wpis zawiera skrot poprzedniego. Wybrane.
4. **Zewnetrzny notariusz** (kotwiczenie skrotu w cudzym systemie). Jedyne
   rozwiazanie dajace gwarancje przy pelnym dostepie do naszej bazy — i jedyne
   wymagajace zewnetrznej uslugi. Poza zakresem projektu; wpisane do roadmapy.

## Decyzja

`audit_log` z kolumnami `prev_hash` i `hash`, gdzie
`hash = sha256(seq|user|action|entity|entity_id|metadata|created_at|prev_hash)`.

**Czego to nie daje.** Lancuch nie czyni logu niezmiennym. Kto ma prawa do bazy,
przeliczy caly lancuch od zmienionego wpisu w gore i zostawi go spojnym. Daje co
innego: zmiana *punktowa* — jeden UPDATE na jednym wierszu — jest wykrywalna, a
zatarcie sladow wymaga przepisania calego ogona logu. To realna roznica w wysilku,
nie gwarancja.

**Cztery szczegoly, w ktorych mieszka poprawnosc:**

*Numer wchodzi do skrotu, wiec musi byc znany przed wstawieniem.* Repozytorium
pobiera `nextval('audit_log_seq_seq')` przed `INSERT`. Gdyby skrot liczyl sie po
wstawieniu, trzeba by go dopisac UPDATE-em — na tabeli, ktora UPDATE-ow nie
przyjmuje.

*Kanoniczna serializacja metadanych.* `JSON.stringify` nie nadaje sie do liczenia
skrotow, bo kolejnosc kluczy zalezy od kolejnosci wstawiania, a Postgres zwraca
`jsonb` z wlasna kolejnoscia. Wpis stawalby sie nieweryfikowalny zaraz po
round-tripie przez baze. Uzywamy wlasnej serializacji z posortowanymi kluczami.

*Ucieczka separatora.* Bez niej wpis o akcji `A|B` i encji `C` mialby ten sam
material do skrotu co wpis o akcji `A` i encji `B|C`, czyli dalby sie podmienic bez
zerwania lancucha.

*Szeregowanie dopisan.* Dwa rownolegle dopisania odczytalyby ten sam koniec
lancucha i utworzyly dwie galezie. Repozytorium bierze blokade doradcza
(`pg_advisory_xact_lock`) na czas transakcji. Blokada doradcza, a nie blokada
wiersza z koncem lancucha, bo przy pustej tabeli nie ma czego blokowac.

**Skrot jako port.** `Hasher` jest interfejsem w domenie, implementacja w
infrastrukturze. Wynika to z zasady, ze `src/domain/` nie importuje niczego spoza
domeny — takze `node:crypto`. Efekt uboczny jest przyjemny: testy lancucha uzywaja
atrapy o czytelnym wyjsciu, wiec gdy asercja padnie, widac ktore pole sie nie
zgadza, zamiast dwoch roznych ciagow szesnastkowych.

## Konsekwencje

- Dopisania do logu audytu sa szeregowane. Swiadome waskie gardlo: lancuch bez
  jednoznacznej kolejnosci nie jest lancuchem. Przy obciazeniu wymagajacym wiecej
  trzeba by przejsc na drzewo Merkle'a z okresowym domykaniem — inna decyzja, inny
  ADR.
- `/api/audit/verify` czyta caly log. Kosztowne i takie zostaje: weryfikacja ma
  odpowiadac na pytanie "czy ktos grzebal", a odpowiedz oparta na probce na to
  pytanie nie odpowiada.
- Weryfikacja rozroznia `hash_mismatch` (zmieniono tresc) od `broken_link`
  (usunieto lub wstawiono wpis) i podaje numer pierwszego wpisu, ktory sie nie
  zgadza. Sam komunikat "cos jest nie tak" nie pomaga w dochodzeniu.
- Test krytyczny nr 6 wylacza wyzwalacz append-only, zeby zmodyfikowac wpis. Jest to
  celowe: zagrozeniem, przed ktorym broni lancuch, nie jest aplikacja, tylko ktos z
  dostepem do bazy. Test, ktory tego nie robi, sprawdza wyzwalacz po raz drugi
  zamiast sprawdzic lancuch.
