# ADR-002: PIN jako step-up auth, nie trzeci czynnik logowania

- **Status:** Zaakceptowany
- **Etap:** 2
- **Data:** 2026-07-30

## Kontekst

Polskie bankowosci internetowe zwykle prosza o trzy rzeczy: numer klienta, haslo i
— przy operacjach — PIN albo kod. Naturalne odczytanie tego wzorca brzmi: "trzy
czynniki logowania". Takie odczytanie jest bledne i prowadzi do systemu slabszego,
niz gdyby PIN-u nie bylo wcale.

PIN ma od czterech do szesciu cyfr, czyli od dziesieciu tysiecy do miliona
kombinacji. Haslo o dwunastu znakach ma ich okolo 10^21. Doklejenie PIN-u do
procesu logowania jako kolejnego kroku nie dodaje wiec bezpieczenstwa
proporcjonalnie — dodaje **kolejna powierzchnie ataku o niskiej entropii**, ktora
mozna probowac niezaleznie.

## Rozwazane opcje

1. **PIN jako trzeci krok logowania.** Uzytkownik podaje numer, haslo i PIN, po
   czym dostaje sesje. Wyglada jak w banku. W praktyce: napastnik, ktory zna haslo,
   ma do zgadniecia jeszcze najwyzej milion kombinacji, a jesli blokada jest
   czasowa, ma tez czas. Odrzucone.
2. **PIN zamiast hasla na urzadzeniu zaufanym.** Popularne w aplikacjach mobilnych,
   gdzie PIN odblokowuje klucz w bezpiecznym module sprzetowym urzadzenia. My nie
   mamy takiego modulu w przegladarce, wiec PIN musialby chronic cos, czego nie ma
   czym chronic. Odrzucone.
3. **PIN jako podniesienie sesji (step-up), zgodnie z modelem PSD2 SCA.**
   Wybrane.

## Decyzja

Logowanie to numer klienta i haslo. Daje sesje poziomu `authenticated` — mozna
przegladac konta, historie i ustawienia.

PIN podnosi sesje do poziomu `elevated` na **piec minut**. Poziom `elevated` jest
wymagany do: przelewu, przewalutowania, podgladu pelnego numeru karty i CVV, zmiany
limitow, blokady i odblokowania karty oraz zmiany hasla.

Rozroznienie odpowiada temu, co PSD2 nazywa Strong Customer Authentication: dowod
tozsamosci jest odswiezany przy operacji, ktora ma skutek finansowy, a nie raz na
poczatku sesji.

**Blokada PIN-u jest twarda, nie czasowa.** Po trzech bledach PIN przestaje dzialac
i odblokowuje go wylacznie ponowne uwierzytelnienie haslem. Blokada czasowa mialaby
sens przy duzej przestrzeni klucza; przy dziesieciu tysiacach kombinacji czekanie
zawsze oplaca sie atakujacemu. Odblokowanie haslem dziala, bo haslo jest czynnikiem,
ktorego napastnik zgadujacy PIN z definicji nie ma.

**Podniesienie zyje w tokenie, nie w bazie.** Token dostepu niesie znacznik
`elevatedUntil`, wiec sprawdzenie poziomu jest darmowe i nie wymaga odczytu.

**Podniesienie nie przedluza sesji.** Nowy token dostepu wydany po weryfikacji
PIN-u zachowuje pierwotny czas wygasniecia. Inaczej wystarczyloby wpisywac PIN co
pare minut, zeby nie wylogowac sie nigdy.

## Konsekwencje

- Podniesienia nie da sie cofnac przed czasem — token jest juz u klienta i jest
  wazny do swojego `exp`. Przy oknie pieciominutowym to akceptowalne; przy godzinie
  trzeba by trzymac stan podniesienia w bazie i placic odczytem przy kazdej operacji.
- Interfejs musi pokazywac poziom sesji: klodka przy operacjach wymagajacych PIN-u,
  licznik pozostalego czasu, modal potwierdzenia. Uzytkownik, ktory nie rozumie,
  dlaczego czasem pyta o PIN, a czasem nie, uzna to za usterke.
- Lista operacji wymagajacych podniesienia zyje w jednym miejscu w domenie
  (`ELEVATED_OPERATIONS`), a nie w warunkach rozsypanych po kontrolerach. Dodanie
  operacji jest wtedy decyzja, a nie przeoczeniem.
- Konto bez ustawionego PIN-u dziala, ale nie wykona przelewu. Blad `PIN_NOT_SET`
  jest osobny od `INVALID_CREDENTIALS`, bo prowadzi do zupelnie innej akcji
  uzytkownika.
