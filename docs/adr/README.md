# Rejestr decyzji architektonicznych (ADR)

Kazdy plik opisuje jedna decyzje: kontekst, rozwazane opcje, wybor i jego koszt.
Numeracja jest ciagla i nie jest przydzielana z gory — ADR powstaje wtedy, gdy
decyzja faktycznie zapada, razem z kodem, ktory ja realizuje. Dzieki temu rejestr
nie zawiera pustych miejsc udajacych plan.

Decyzja raz zapisana nie jest edytowana poza polem statusu. Zmiana zdania to nowy
ADR ze statusem `Zastepuje ADR-XXX`, a stary dostaje `Zastapiony przez ADR-YYY`.
Historia pomylek jest tu wartoscia, nie wstydem — pokazuje, co bylo wiadomo w
momencie wyboru.

| Nr | Tytul | Status | Etap |
|----|-------|--------|------|
| [001](001-warstwy-i-kierunek-zaleznosci.md) | Warstwy i kierunek zaleznosci | Zaakceptowany | 0 |
| [004](004-kwoty-jako-bigint-w-jednostkach-minor.md) | Kwoty jako BIGINT w jednostkach minor | Zaakceptowany | 0 |
| [009](009-warstwa-application-jako-granica-transakcji.md) | Warstwa application jako granica transakcji | Zaakceptowany | 0 |

Numery 002, 003 i 005–008 sa zarezerwowane dla decyzji zapadajacych w etapach
1–4 (schemat ksiegi, wyzwalacze append-only, model sesji i tokenow, idempotencja
na poziomie HTTP, lancuch skrotow audytu, integracja z NBP). Ich ADR-y powstana
razem z kodem tych etapow.
