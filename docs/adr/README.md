# Rejestr decyzji architektonicznych (ADR)

Kazdy plik opisuje jedna decyzje: kontekst, rozwazane opcje, wybor i jego koszt.

Numery 001–008 sa przypisane z gory przez specyfikacje projektu (sekcja 13) i
czekaja na etapy, w ktorych te decyzje faktycznie zapadaja. Numery od 009 w gore
opisuja decyzje, ktorych specyfikacja nie przewidziala, a ktore trzeba bylo podjac.

Decyzja raz zapisana nie jest edytowana poza polem statusu. Zmiana zdania to nowy
ADR ze statusem `Zastepuje ADR-XXX`, a stary dostaje `Zastapiony przez ADR-YYY`.
Historia pomylek jest tu wartoscia — pokazuje, co bylo wiadomo w momencie wyboru.

| Nr | Tytul | Status | Etap |
|----|-------|--------|------|
| 001 | Ksiega podwojnego zapisu zamiast mutowalnego salda | Planowany | 1 |
| 002 | PIN jako step-up auth, nie trzeci czynnik logowania | Planowany | 2 |
| 003 | Odrzucenie maskowanych hasel | Planowany | 2 |
| [004](004-kwoty-jako-bigint-w-jednostkach-minor.md) | Kwoty jako BIGINT w jednostkach minor | Zaakceptowany | 0 |
| 005 | Pessimistic locking zamiast optimistic dla ruchu pieniedzy | Planowany | 1 |
| 006 | Konta wewnetrzne banku jako druga strona kazdego zapisu | Planowany | 1 |
| 007 | Klucze idempotencji: zakres, TTL, obsluga kolizji | Planowany | 1 |
| 008 | Cache i degradacja kursow NBP | Planowany | 5 |
| [009](009-warstwy-i-kierunek-zaleznosci.md) | Warstwy i kierunek zaleznosci | Zaakceptowany | 0 |
| [010](010-warstwa-application-jako-granica-transakcji.md) | Warstwa application jako granica transakcji | Zaakceptowany | 0 |
