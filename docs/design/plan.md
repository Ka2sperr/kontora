# Plan designu — Kontora

Dokument wymagany przez sekcje 10 specyfikacji: kolory, typografia, layout i element
signature **przed** napisaniem jakiegokolwiek CSS.

## Punkt wyjscia: czego unikamy

Domyslny wyglad, ktory generuje sie dla kazdego dashboardu finansowego, to ciemne
tlo, jeden neonowo-zielony akcent, szklane karty i gradienty. Rekruter widzi ten
zestaw kilka razy w tygodniu i rozpoznaje go w pol sekundy — nie jako styl, tylko
jako brak decyzji.

Drugi domyslny wyglad to "czysty SaaS": biale tlo, Inter, niebieski przycisk,
zaokraglone rogi 8 px, cien pod karta. Poprawny i niewidzialny.

## Kierunek: papier i tusz

Ten projekt istnieje po to, zeby pokazac ksiege podwojnego zapisu. Interfejs
powinien wygladac jak **dobrze zlozona ksiega rachunkowa**, a nie jak pulpit
kryptowaluty. Wlosowe linie zamiast cieni, kolumny kwot wyrownane co do cyfry,
kolory tuszu i stempla zamiast neonow.

To nie jest stylizacja retro. To wybor, w ktorym forma mowi to samo, co architektura:
tu chodzi o zapisy, ktore sie bilansuja.

## Kolory

Szesc nazwanych wartosci. Nazwy sa polskie i rzeczowe, bo `--kolor-stempel` mowi
wiecej o intencji niz `--red-600`.

| Nazwa | Hex | Rola |
|-------|-----|------|
| `atrament` | `#1B1B1F` | tekst podstawowy, ciepla czern zamiast czystej #000 |
| `papier` | `#FAF7F2` | tlo, cieplo-kremowe, nie biale |
| `linia` | `#DED7CB` | linie wlosowe, obramowania tabel, separatory |
| `atrament-niebieski` | `#23478E` | akcent glowny: linki, przyciski, focus |
| `stempel` | `#A4362B` | obciazenia, ostrzezenia, blad — kolor stempla na dokumencie |
| `zielen-ksiegi` | `#2F5D50` | uznania, potwierdzenia — stonowana, nie neonowa |

Kontrast wzgledem `papier`: `atrament` 15,8:1, `atrament-niebieski` 8,1:1, `stempel`
6,4:1, `zielen-ksiegi` 7,2:1. Wszystkie z zapasem ponad AA, takze dla tekstu 14 px.

### Tryb ciemny

Nie odwrocenie jasnego. Osobna tozsamosc: **nocna zmiana** — tlo `#16161A`, tekst
`#EDE7DD` (kremowy, nie bialy), linie `#2E2C29`. Akcenty przechodza na jasniejsze
warianty tego samego tuszu: `#7FA0E0`, `#E08578`, `#7FB3A0`. Papier nie udaje, ze
jest bialy w nocy, a tusz nie zmienia sie w neon.

## Typografia

**Fraunces** — naglowki i pojedyncze duze kwoty. Serif o zmiennej osi `SOFT` i
`WONK`, z wyraznym charakterem w kursywie. Wybrany, bo ma osobowosc, ktorej brakuje
gotykom uzywanym domyslnie, a jednoczesnie nalezy do rodziny krojow uzywanych w
druku ksiegowym i prasowym.

**IBM Plex Sans** — tekst, interfejs, dane tabelaryczne. Wybrany z dwoch powodow:
ma prawdziwe cyfry tabelaryczne (`font-variant-numeric: tabular-nums`), a jego
rysunek jest instytucjonalny bez bycia zimnym. Rodzina ma tez `IBM Plex Mono`, gdyby
byl potrzebny numer transakcji albo IBAN.

Kwoty i wszystkie kolumny liczbowe: `tabular-nums` bezwzglednie. W aplikacji
finansowej niewyrownana kolumna kwot jest pierwsza rzecza, ktora widac.

## Layout

**Arkusz ksiegi.** Lewa szyna (240 px) to spis kont — jak indeks na poczatku ksiegi.
Glowna kolumna to arkusz: tresc lezy na widocznej siatce linii wlosowych, kwoty maja
wlasna, prawostronnie wyrownana kolumne o stalej szerokosci.

Zero cieni. Zero zaokraglen wiekszych niz 2 px. Podzial buduja linie, nie karty.
Odstepy z jednej skali: 4, 8, 12, 16, 24, 32, 48, 64.

Ponizej 900 px szyna zwija sie w poziomy przelacznik kont nad trescia. Do 375 px
wszystko dziala bez przewijania w poziomie.

## Element signature: pasek ksiegowy

Kazdy wiersz historii rozwija sie **w miejscu**, pokazujac swoje zapisy ksiegowe
jako miniaturowy arkusz: kolumna obciazen po lewej (stempel), kolumna uznan po
prawej (zielen ksiegi), a pod nimi linia podwojna i suma — zawsze zero.

```
  Przelew do Anny Kowalskiej                        −100,00 zl
  ┌────────────────────────────────┬──────────────┬──────────────┐
  │ Konto osobiste PLN             │   −100,00 zl │              │
  │ Konto Anny Kowalskiej          │              │   +100,00 zl │
  ├────────────────────────────────┼──────────────┼──────────────┤
  │ Suma                           │        0,00 zl              │
  └────────────────────────────────┴══════════════┴══════════════┘
```

Podwojna linia nad suma to konwencja z prawdziwej ksiegowosci. To po niej ten
interfejs bedzie zapamietany — i to ona pokazuje w dwie sekundy, o co w calym
projekcie chodzi.

## Podloga jakosci

Nie ogloszona w interfejsie, po prostu obecna:

- responsywnosc do 375 px, bez przewijania w poziomie,
- widoczny pierscien focusu w `atrament-niebieski`, grubosc 2 px, offset 2 px,
- `prefers-reduced-motion: reduce` wylacza wszystkie przejscia,
- kontrast AA dla kazdego zestawienia tekstu z tlem,
- pelna obsluga z klawiatury, lacznie z rozwijaniem paska ksiegowego,
- kwoty ujemne i dodatnie roznia sie **znakiem i pozycja w kolumnie**, nie tylko
  kolorem — wymog dostepnosci, ktory przy okazji jest poprawna ksiegowoscia,
- PL/EN od poczatku: teksty w slownikach, nie w komponentach.

## Copy

Z perspektywy uzytkownika. "Potwierdz PIN-em", nie "Wykonaj step-up auth". Bledy
mowia, co sie stalo i co zrobic: "Na koncie jest 84,20 zl. Zmniejsz kwote albo wybierz
inne konto." zamiast "Blad walidacji: INSUFFICIENT_FUNDS".

## Co bedzie kosztowalo zmiane kierunku

Wszystkie wartosci zyja jako zmienne CSS w jednym pliku (`src/app/tokens.css`) i sa
udostepnione Tailwindowi przez `@theme`. Zmiana palety to zmiana szesciu wartosci;
zmiana krojow to dwie linijki w `layout.tsx`. Komponenty nie znaja zadnego heksa.
