# ADR-007: Klucze idempotencji — zakres, TTL, obsluga kolizji

- **Status:** Zaakceptowany
- **Etap:** 1
- **Data:** 2026-07-30

## Kontekst

Klient mobilny wysyla przelew, traci zasieg i nie dostaje odpowiedzi. Nie wie,
czy przelew przeszedl. Ponawia. Bez idempotencji klient placi dwa razy — i jest to
najczestszy sposob, w jaki systemy platnicze gubia zaufanie.

## Rozwazane opcje

**Gdzie trzymac klucz.**

1. Osobna tabela `idempotency_keys` z odpowiedzia zapisana w JSON. Elastyczne,
   dziala dla operacji niepienieznych, ale wprowadza drugie zrodlo prawdy o wyniku
   operacji — ktore moze sie rozjechac z ksiega.
2. Kolumna `idempotency_key` w `transactions` z ograniczeniem UNIQUE. Wynik
   odtwarza sie z ksiegi, wiec nie ma czego rozjezdzac. Wybrane.

**Jak wykrywac powtorzenie.**

1. `SELECT` po kluczu, potem `INSERT`, jesli nic nie ma. Ma okno wyscigu miedzy
   jednym a drugim: przy dziesieciu rownoleglych zadaniach z tym samym kluczem
   kilka przechodzi sprawdzenie jednoczesnie. Odpada.
2. `INSERT` i przechwycenie naruszenia UNIQUE. Baza rozstrzyga wyscig, bo tylko
   ona widzi wszystkich uczestnikow. Wybrane.

## Decyzja

**Zakres klucza jest globalny**, nie per uzytkownik. Klucz to identyfikator
zadania, a nie zadanie samo w sobie: dwa rozne zlecenia z tym samym kluczem to
blad klienta, nie zbieg okolicznosci. Klucze generuje klient jako UUID, wiec
kolizja miedzy roznymi uzytkownikami jest praktycznie niemozliwa, a globalny zakres
upraszcza ograniczenie do jednego indeksu.

**Kolejnosc operacji.** Sprawdzenie klucza odbywa sie najpierw poza transakcja —
najczestszy przypadek (klient ponowil po timeoucie, oryginal jest zaksiegowany)
konczy sie jednym odczytem, bez otwierania transakcji i bez blokowania kont.
Dopiero potem otwiera sie transakcja, w ktorej naglowek wstawiany jest **przed**
zapisami. Wymusza to klucz obcy, ale daje tez efekt, ktory jest tu wazniejszy:
ograniczenie UNIQUE strzela natychmiast, zanim ktokolwiek zdazy zablokowac konta.

**Obsluga kolizji.** Adapter tlumaczy SQLSTATE 23505 na domenowy
`IDEMPOTENCY_CONFLICT`. Warstwa aplikacji lapie go, odczytuje transakcje
zwyciezcy i zwraca ja jako wlasny wynik. Klient dostaje ten sam identyfikator
transakcji co przy pierwszym zadaniu.

Wazny szczegol implementacyjny: Drizzle opakowuje wyjatek sterownika we wlasny,
zeby dolaczyc tresc zapytania. `error.code` na wierzchu jest wtedy puste, wiec
rozpoznawanie SQLSTATE musi schodzic po lancuchu `cause`. Bez tego naruszenie
klucza przeciekaloby do klienta jako blad 500 zamiast poprawnej odpowiedzi na
powtorzone zadanie.

**Nieudana operacja nie konsumuje klucza.** Transakcja odrzucona z powodu braku
srodkow wycofuje sie w calosci, wiec naglowek znika razem z kluczem. Ponowienie z
tym samym kluczem jest liczone od nowa.

To swiadomy wybor. Alternatywa — zapamietywanie odrzucen — oznaczalaby, ze klient,
ktoremu zabraklo srodkow i ktory sekunde pozniej dostal przelew przychodzacy,
musi wymyslic nowy klucz, zeby sprobowac ponownie. Jego aplikacja tego nie zrobi,
bo z jej perspektywy to wciaz to samo zlecenie. Koszt wyboru: jesli zadanie
zostanie odrzucone i **rownoczesnie** ponowione, oba moga sie wykonac, gdy w
miedzyczasie pojawily sie srodki. Zdarzenie wymagajace zbiegu trzech okolicznosci,
a alternatywa lamie zwykly przypadek.

**TTL: brak.** Klucze zyja tak dlugo jak transakcje, czyli wiecznie. Kasowanie
starych kluczy wymagaloby `DELETE` na tabeli powiazanej z ksiega, a ksiega jest
tylko do dopisywania. Koszt to jeden indeks tekstowy rosnacy liniowo z liczba
transakcji — w zamian za brak calej klasy pytan o to, co sie stanie z zadaniem
ponowionym po wygasnieciu klucza.

## Konsekwencje

- Dziesiec rownoleglych zadan z tym samym kluczem daje jedna transakcje i
  dziesiec identycznych odpowiedzi. Sprawdzone testem, nie zalozeniem.
- Klient MUSI wygenerowac klucz przed wyslaniem, nie po. Klucz generowany
  serwerowo nie chronilby przed niczym, bo ponowione zadanie dostaloby nowy.
- Endpointy zmieniajace stan wymagaja naglowka `Idempotency-Key`. Brak naglowka to
  blad walidacji, nie ciche przepuszczenie — inaczej mechanizm bylby opcjonalny,
  czyli zadny.
