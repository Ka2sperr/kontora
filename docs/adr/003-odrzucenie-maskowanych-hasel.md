# ADR-003: Odrzucenie maskowanych hasel

- **Status:** Zaakceptowany (decyzja o niewdrazaniu)
- **Etap:** 2
- **Data:** 2026-07-30

## Kontekst

Czesc polskich bankow prosi przy logowaniu o wybrane znaki hasla: "podaj znaki 2, 5
i 7". Wzorzec jest na tyle rozpoznawalny, ze jego brak w aplikacji bankowej wyglada
na niedopatrzenie. Ten ADR istnieje po to, zeby bylo jasne, ze jest decyzja.

Uzasadnienie maskowania brzmi: keylogger, ktory podsluchal jedno logowanie, nie
pozna calego hasla. Cel jest sensowny. Problem lezy w tym, czego wymaga jego
osiagniecie.

## Czego wymagaloby wdrozenie

Zeby serwer mogl sprawdzic znaki 2, 5 i 7, musi je znac **osobno**. Sa dokladnie
trzy sposoby, zeby to osiagnac, i kazdy oslabia baze:

1. **Haslo szyfrowane odwracalnie.** Klucz musi byc dostepny procesowi, ktory
   weryfikuje logowanie, wiec lezy tam, gdzie baza. Wyciek bazy przestaje oznaczac
   "napastnik ma hashe do lamania" i zaczyna oznaczac "napastnik ma hasla".
2. **Hash kazdego znaku osobno.** Hash pojedynczego znaku z alfabetu okolo
   dziewiecdziesieciu znakow lamie sie natychmiast, niezaleznie od funkcji skrotu.
   Sol per znak nie pomaga: przestrzen ma dziewiecdziesiat elementow.
3. **Hashe wszystkich uzywanych kombinacji.** Dla trojek z hasla dwunastoznakowego
   to 220 hashy na uzytkownika. Kazdy z nich jest hashem trzech znakow, czyli —
   znowu — czegos, co lamie sie natychmiast.

Wszystkie trzy drogi prowadza do tego samego: haslo przestaje byc chronione funkcja
jednokierunkowa o duzym koszcie. Argon2id, ktory ma sens wylacznie wtedy, gdy
chroni cale haslo naraz, przestaje cokolwiek wnosic.

Do tego maskowanie wyklucza menedzery hasel — a menedzer hasel jest w praktyce
najskuteczniejsza ochrona przed atakami na haslo, jaka zwykly uzytkownik ma do
dyspozycji. Wzorzec, ktory chroni przed keyloggerem, zmuszajac uzytkownika do
recznego przepisywania hasla, ma trudna do obrony bilans.

## Decyzja

**Nie wdrazamy maskowanych hasel.** Zamiast tego:

- pelne haslo, minimum dwanascie znakow, bez wymogow kompozycji (NIST SP 800-63B),
- Argon2id z kosztem pamieciowym 64 MiB,
- sprawdzenie w bazie wyciekow HIBP w modelu k-anonimowosci,
- blokada z rosnacym opoznieniem po piatej nieudanej probie,
- PIN jako podniesienie sesji przy operacjach finansowych (ADR-002),
- pelna zgodnosc z menedzerami hasel.

Zagrozenie, przed ktorym mialo bronic maskowanie — przechwycenie hasla na urzadzeniu
uzytkownika — jest tu adresowane inaczej: nawet z haslem napastnik nie wykona
przelewu bez PIN-u, a PIN blokuje sie twardo po trzech probach.

## Konsekwencje

- Aplikacja nie wyglada jak polski bank przy logowaniu. Swiadomie.
- Ochrona przed keyloggerem jest slabsza niz przy maskowaniu — napastnik, ktory
  podsluchal haslo, zaloguje sie. Nie wykona jednak operacji finansowej, bo nie ma
  PIN-u.
- Wyciek bazy zostawia napastnika z hashami Argon2id, a nie z hasłami. To jest ta
  wlasciwosc, ktorej maskowanie kazaloby sie zrzec, i to ona przewazyla.
- Pokazanie, ze umie sie odmowic implementacji rozpoznawalnego wzorca i uzasadnic
  odmowe, jest tu celem samym w sobie — tak samo jak dzialajacy kod.
