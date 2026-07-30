# Kontora

Demonstracyjna aplikacja bankowa oparta o ksiege podwojnego zapisu — projekt
portfolio pokazujacy, jak pieniadze poruszaja sie w systemie finansowym.

> **Aplikacja demonstracyjna.** Brak realnych pieniedzy. Brak integracji z jakakolwiek
> instytucja finansowa. Nie wprowadzaj prawdziwych danych osobowych, numerow kart ani
> hasel uzywanych gdziekolwiek indziej.

Kontora nie jest bankiem, nie ma nic wspolnego z zadnym istniejacym bankiem i nie
przyjmuje prawdziwych danych. Testowe numery kart zaczynaja sie od cyfry `9`, a
aplikacja aktywnie odrzuca dane wejsciowe wygladajace na prawdziwy numer karty.
Rejestracja nie wymaga i nie przechowuje numeru PESEL, numeru dokumentu ani adresu.

## Co tu jest ciekawego

- Ksiega podwojnego zapisu: stan konta jest suma wpisow w ksiedze, nie kolumna, ktora
  ktos nadpisuje. `balance_cached_minor` to wylacznie pamiec podreczna przeliczana w
  tej samej transakcji bazodanowej.
- Kwoty jako `BIGINT` w jednostkach minor z osobna kolumna waluty — zero arytmetyki
  zmiennoprzecinkowej na pieniadzach ([ADR-004](docs/adr/004-kwoty-jako-bigint-w-jednostkach-minor.md)).
- Ksiega i log audytu sa tylko do dopisywania, wymuszone wyzwalaczem w Postgresie, a
  nie dobra wola kodu aplikacji.
- Warstwa domenowa nie importuje ani Next.js, ani Drizzle. Granica jest egzekwowana
  przez lint i przez test architektury, ktory sam siebie sprawdza
  ([ADR-001](docs/adr/001-warstwy-i-kierunek-zaleznosci.md)).
- Kazda operacja zmieniajaca stan wymaga klucza idempotencji; powtorzenie zwraca
  oryginalny wynik zamiast wykonywac operacje drugi raz
  ([ADR-009](docs/adr/009-warstwa-application-jako-granica-transakcji.md)).
- Wlasna implementacja uwierzytelniania — bez NextAuth i bez Clerk. Argon2id, sesje w
  ciasteczkach `httpOnly`, rotacja tokenow odswiezajacych.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript w trybie strict · Tailwind CSS 4 ·
PostgreSQL 17 · Drizzle ORM z wersjonowanymi migracjami · Zod na kazdej granicy
wejscia · Vitest (jednostkowe, property-based, architektura) · Playwright (E2E) ·
GitHub Actions · Docker Compose lokalnie.

## Uruchomienie lokalne

Wymagane: Node 20+, pnpm, Docker.

```bash
pnpm install
cp .env.example .env        # uzupelnij DATABASE_URL, jesli zmieniasz porty
docker compose up -d        # Postgres 17 na porcie 5432
pnpm db:migrate             # migracje pojawiaja sie od Etapu 1
pnpm dev                    # http://localhost:3000
```

Weryfikacja przed commitem — dokladnie to, co robi CI:

```bash
pnpm verify            # typecheck + lint + testy jednostkowe i architektury
pnpm test:integration  # testy wymagajace dzialajacej bazy
```

Plik `.env` nigdy nie trafia do repozytorium. `.env.example` opisuje kazda zmienna i
jest jedynym plikiem `.env*`, ktory jest commitowany.

## Struktura

```
src/domain/          encje, wartosci, niezmienniki, porty — zero zaleznosci
src/application/     przypadki uzycia, granica transakcji
src/infrastructure/  Drizzle, postgres.js, zegar, generator ID, adaptery zewnetrzne
src/http/            Route Handlery i Server Actions
src/app/             warstwa Next.js: routing i komponenty
tests/architecture/  straznik granicy miedzy warstwami
tests/properties/    testy property-based na niezmiennikach
docs/adr/            decyzje architektoniczne
```

## Stan prac

Projekt powstaje etapami; kazdy etap konczy sie osobna galezia i pull requestem.

| Etap | Zakres | Stan |
|------|--------|------|
| 0 | Fundament: TS strict, granice warstw, Docker, CI, prymitywy kwot | Gotowe |
| 1 | Schemat ksiegi, wyzwalacze append-only, niezmiennik sumy zero | Planowane |
| 2 | Przelewy, idempotencja, testy wspolbieznosci | Planowane |
| 3 | Uwierzytelnianie, sesje, warstwa wizualna, i18n | Planowane |
| 4 | Wielowalutowosc, kursy NBP, przewalutowania | Planowane |
| 5 | Karty (maskowanie, limity, blokady) | Planowane |
| 6 | Platnosci cykliczne, harmonogram | Planowane |
| 7 | Log audytu z lancuchem skrotow, panel administracyjny | Planowane |
| 8 | Wdrozenie, obserwowalnosc, dokumentacja koncowa | Planowane |

Rzeczy niedokonczone sa zapisane jako zgloszenia w repozytorium, a nie jako komentarze
`TODO` w kodzie.

## Licencja

Projekt edukacyjny. Kod mozna czytac, uruchamiac i uczyc sie na nim. Nie nadaje sie do
zadnego zastosowania produkcyjnego zwiazanego z pieniedzmi.
