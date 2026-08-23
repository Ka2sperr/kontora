import type { Locale } from "@/i18n/config";

/**
 * Slowniki. Typ `Dictionary` pochodzi z wersji polskiej, wiec brak klucza w
 * angielskiej jest bledem kompilacji — a nie tekstem `undefined` na produkcji.
 */
const pl = {
  wspolne: {
    nazwaMarki: "Kontora",
    zaloguj: "Zaloguj sie",
    wyloguj: "Wyloguj",
    dalej: "Dalej",
    wstecz: "Wstecz",
    anuluj: "Anuluj",
    potwierdz: "Potwierdz",
    zamknij: "Zamknij",
    wczytywanie: "Wczytuje...",
    sprobujPonownie: "Sprobuj ponownie",
    jezyk: "Jezyk",
    dostepne: "dostepne",
    brakDanych: "Brak danych do pokazania.",
  },
  baner: {
    tytul: "Aplikacja demonstracyjna.",
    tresc:
      "Brak realnych pieniedzy. Brak integracji z jakakolwiek instytucja finansowa. Nie wprowadzaj prawdziwych danych osobowych, numerow kart ani hasel uzywanych gdziekolwiek indziej.",
  },
  logowanie: {
    tytul: "Zaloguj sie do Kontory",
    krokNumer: "Numer klienta",
    krokHaslo: "Haslo",
    krokPin: "PIN",
    numerKlienta: "Numer klienta",
    numerKlientaOpis: "Osiem cyfr, ostatnia jest cyfra kontrolna.",
    haslo: "Haslo",
    pin: "PIN",
    pinOpis: "PIN potwierdza operacje, nie loguje. Podasz go przy przelewie.",
    zalogujDemo: "Zaloguj jako demo",
    demoOpis:
      "Konto pokazowe z dziesiecioma miesiacami historii. Dane logowania sa jawne — wypelnimy je za Ciebie.",
    demoDaneTytul: "Dane konta demo",
    demoNumer: "Numer klienta",
    demoHaslo: "Haslo",
    demoPin: "PIN",
    krok: "Krok",
    zTrzech: "z 3",
  },
  pulpit: {
    tytul: "Pulpit",
    laczneSaldo: "Laczne saldo",
    laczneSaldoOpis: "Konta walutowe przeliczone po biezacym kursie.",
    twojeKonta: "Twoje konta",
    ostatnieOperacje: "Ostatnie operacje",
    wydatkiWgKategorii: "Wydatki wedlug kategorii",
    zobaczWszystkie: "Zobacz cala historie",
  },
  konto: {
    historia: "Historia operacji",
    saldo: "Saldo",
    dostepneSrodki: "Dostepne srodki",
    limitKredytowy: "Limit kredytowy",
    filtrOd: "Od dnia",
    filtrDo: "Do dnia",
    filtrKategoria: "Kategoria",
    filtrSzukaj: "Szukaj w tytule i odbiorcy",
    filtrKwotaOd: "Kwota od",
    filtrKwotaDo: "Kwota do",
    wyczyscFiltry: "Wyczysc filtry",
    wczytajWiecej: "Wczytaj wiecej",
    pokazZapisy: "Pokaz zapisy ksiegowe",
    ukryjZapisy: "Ukryj zapisy ksiegowe",
    obciazenia: "Obciazenia",
    uznania: "Uznania",
    suma: "Suma",
    sumaOpis:
      "Suma zapisow kazdej transakcji wynosi zero. Tak dziala ksiega podwojnego zapisu.",
    pustaHistoria: "Na tym koncie nie ma jeszcze zadnych operacji.",
    pustaHistoriaFiltry: "Zaden wpis nie pasuje do wybranych filtrow.",
    identyfikator: "Identyfikator transakcji",
  },
  konta: {
    checking: "Konto osobiste",
    savings: "Konto oszczednosciowe",
    credit: "Karta kredytowa",
    internal: "Konto wewnetrzne banku",
  },
  bledy: {
    ogolny: "Cos poszlo nie tak. Sprobuj ponownie.",
    siec: "Brak polaczenia z serwerem. Sprawdz siec i sprobuj ponownie.",
    sesjaWygasla: "Sesja wygasla. Zaloguj sie ponownie.",
  },
};

/**
 * Ksztalt slownika wywiedziony z wersji polskiej — bez `as const`, zeby wartosci
 * mialy typ `string`, a nie typ konkretnego polskiego napisu. Z `as const`
 * angielskie tlumaczenie nie przechodziloby kompilacji, bo "Sign in" nie jest
 * przypisywalne do typu "Zaloguj sie".
 *
 * Sprawdzanie kluczy zostaje: brak klucza w `en` to blad kompilacji, nadmiarowy
 * klucz rowniez.
 */
export type Dictionary = typeof pl;

/** Struktura identyczna jak `pl` — inaczej nie skompiluje sie. */
const en: Dictionary = {
  wspolne: {
    nazwaMarki: "Kontora",
    zaloguj: "Sign in",
    wyloguj: "Sign out",
    dalej: "Continue",
    wstecz: "Back",
    anuluj: "Cancel",
    potwierdz: "Confirm",
    zamknij: "Close",
    wczytywanie: "Loading...",
    sprobujPonownie: "Try again",
    jezyk: "Language",
    dostepne: "available",
    brakDanych: "Nothing to show yet.",
  },
  baner: {
    tytul: "Demonstration application.",
    tresc:
      "No real money. No integration with any financial institution. Do not enter real personal data, card numbers, or passwords you use anywhere else.",
  },
  logowanie: {
    tytul: "Sign in to Kontora",
    krokNumer: "Customer number",
    krokHaslo: "Password",
    krokPin: "PIN",
    numerKlienta: "Customer number",
    numerKlientaOpis: "Eight digits; the last one is a check digit.",
    haslo: "Password",
    pin: "PIN",
    pinOpis: "The PIN confirms operations, it does not sign you in. You will enter it when making a transfer.",
    zalogujDemo: "Sign in with the demo account",
    demoOpis:
      "A showcase account with ten months of history. The credentials are public — we will fill them in for you.",
    demoDaneTytul: "Demo account credentials",
    demoNumer: "Customer number",
    demoHaslo: "Password",
    demoPin: "PIN",
    krok: "Step",
    zTrzech: "of 3",
  },
  pulpit: {
    tytul: "Dashboard",
    laczneSaldo: "Total balance",
    laczneSaldoOpis: "Foreign-currency accounts converted at the current rate.",
    twojeKonta: "Your accounts",
    ostatnieOperacje: "Recent activity",
    wydatkiWgKategorii: "Spending by category",
    zobaczWszystkie: "See full history",
  },
  konto: {
    historia: "Transaction history",
    saldo: "Balance",
    dostepneSrodki: "Available funds",
    limitKredytowy: "Credit limit",
    filtrOd: "From",
    filtrDo: "To",
    filtrKategoria: "Category",
    filtrSzukaj: "Search title and counterparty",
    filtrKwotaOd: "Amount from",
    filtrKwotaDo: "Amount to",
    wyczyscFiltry: "Clear filters",
    wczytajWiecej: "Load more",
    pokazZapisy: "Show ledger entries",
    ukryjZapisy: "Hide ledger entries",
    obciazenia: "Debits",
    uznania: "Credits",
    suma: "Total",
    sumaOpis:
      "Every transaction's entries sum to zero. That is how double-entry bookkeeping works.",
    pustaHistoria: "This account has no activity yet.",
    pustaHistoriaFiltry: "No entries match the selected filters.",
    identyfikator: "Transaction ID",
  },
  konta: {
    checking: "Current account",
    savings: "Savings account",
    credit: "Credit card",
    internal: "Bank internal account",
  },
  bledy: {
    ogolny: "Something went wrong. Please try again.",
    siec: "Cannot reach the server. Check your connection and try again.",
    sesjaWygasla: "Your session expired. Please sign in again.",
  },
};

const DICTIONARIES: Record<Locale, Dictionary> = { pl, en };

export function dictionaryFor(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}
