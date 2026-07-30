# ADR-001: Ksiega podwojnego zapisu zamiast mutowalnego salda

- **Status:** Zaakceptowany
- **Etap:** 1
- **Data:** 2026-07-30

## Kontekst

Najprostszy model konta bankowego to kolumna `balance` i `UPDATE accounts SET
balance = balance - 100 WHERE id = ...`. Dziala, jest szybki i jest podstawa
wiekszosci projektow portfolio nazywanych "aplikacja bankowa".

Ma trzy wady, ktore ujawniaja sie dokladnie wtedy, gdy jest juz za pozno:

1. **Brak historii przyczyn.** Saldo mowi ile, nie mowi dlaczego. Odpowiedz na
   pytanie "skad ta kwota" wymaga osobnej tabeli operacji, ktora nie jest z
   saldem powiazana zadnym mechanizmem — czyli moze sie z nim rozjechac.
2. **Brak wykrywalnosci bledu.** Jesli `UPDATE` sie zgubi albo wykona dwa razy,
   saldo bedzie zle i nic tego nie zasygnalizuje. Nie ma niezmiennika, ktory
   dalby sie sprawdzic.
3. **Pieniadze powstaja i znikaja.** Przelew to dwa `UPDATE`. Miedzy nimi jest
   moment, w ktorym kwota nie istnieje nigdzie. Jesli cokolwiek przerwie ciag,
   pieniadze przepadaja bez sladu.

## Rozwazane opcje

1. **Kolumna `balance` plus tabela operacji.** Najmniej pracy. Odpada z powodow
   wyzej — dwa zrodla prawdy bez mechanizmu uzgadniania.
2. **Event sourcing.** Zdarzenia jako zrodlo prawdy, saldo jako projekcja.
   Rozwiazuje te same problemy i jeszcze kilka, ale wprowadza wersjonowanie
   zdarzen, projekcje, ich przebudowe i ewentualna niespojnosc odczytu. Zbyt duzo
   maszynerii jak na zakres tego projektu.
3. **Ksiega podwojnego zapisu.** Kazda operacja to zestaw zapisow sumujacych sie
   do zera. Wybrane.

## Decyzja

Zrodlem prawdy jest tabela `ledger_entries`. Saldo konta to `SUM(amount_minor)`
po tym koncie.

- **Kazda transakcja bilansuje sie do zera, osobno w kazdej walucie.** Wymuszone
  odroczonym wyzwalaczem `ledger_entries_balanced`, sprawdzanym przy COMMIT.
  Sprawdzenie musi byc odroczone: w trakcie wstawiania kolejnych zapisow suma z
  definicji nie jest zerem.
- **Ksiega jest tylko do dopisywania.** Wyzwalacz poziomu instrukcji blokuje
  UPDATE, DELETE i TRUNCATE. Poziom instrukcji, a nie wiersza, bo `DELETE FROM
  ledger_entries WHERE false` tez ma sie nie udac — intencja usuniecia z ksiegi
  jest bledem niezaleznie od tego, ile wierszy trafil warunek.
- **Konta wewnetrzne banku sa druga strona kazdego zapisu**, ktory wychodzi poza
  klientow (ADR-006).
- **`balance_cached_minor` jest pamiecia podreczna, nie saldem.** Przeliczana
  w tej samej transakcji, w ktorej powstaja zapisy, przez pelne zsumowanie ksiegi
  dla danego konta — nie przez `balance = balance + delta`. Wersja przyrostowa
  jest tansza, ale utrwala kazdy raz powstaly rozjazd; wersja pelna sama go
  naprawia przy najblizszej operacji na koncie.
- **Decyzje o pieniadzach czytaja ksiege, nie pamiec podreczna.** Repozytorium
  zwraca saldo policzone podzapytaniem po `ledger_entries`. Gdyby sprawdzenie
  "czy stac cie na ten przelew" czytalo kolumne podreczna, jej rozjazd z ksiega
  zamienialby sie w prawdziwe pieniadze.

## Konsekwencje

- Pieniadze nie moga zniknac ani powstac w wyniku bledu w kodzie aplikacji.
  Zeby to zrobic, trzeba wstawic niezbilansowany zestaw zapisow — a baza go nie
  przyjmie.
- Historia jest kompletna z definicji: nie ma stanu, ktory nie wynikalby z ciagu
  zapisow. Ekran "pokaz zapisy ksiegowe" nie wymaga zadnej dodatkowej tabeli.
- **Koszt: odczyt salda jest zapytaniem agregujacym.** Przy koncie z dziesiecioma
  miesiacami historii to okolo czterystu wierszy na indeksie `(account_id, id)` —
  bez znaczenia. Przy koncie z milionami zapisow trzeba by wprowadzic okresowe
  migawki salda (saldo otwarcia miesiaca plus zapisy od tej daty). Nie robimy
  tego teraz, bo optymalizacja bez zmierzonego problemu dodaje kod, ktory moze sie
  rozjechac z ksiega — czyli dokladnie to, czego ten ADR unika.
- Kazda operacja wymaga wskazania obu stron. Nie da sie "dodac klientowi 100 zl"
  bez odpowiedzi na pytanie, z czyjego konta. To niewygoda w seederze i zaleta
  wszedzie indziej.
- Cofniecie operacji to zapis odwrotny (`reversed`), nigdy usuniecie oryginalu.
