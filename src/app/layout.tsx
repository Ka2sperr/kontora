import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Sans } from "next/font/google";
import { DemoBanner } from "@/components/demo-banner";
import { currentDictionary } from "@/i18n/server";
import "./globals.css";

/**
 * Kroje z Etapu 3.
 *
 * Fraunces do naglowkow — serif o wlasnym charakterze, z rodziny krojow uzywanych
 * w druku, a nie kolejny neutralny gotyk. IBM Plex Sans do tekstu i danych, bo ma
 * prawdziwe cyfry tabelaryczne, a bez nich kolumna kwot sie nie wyrownuje.
 *
 * `display: "swap"` — tekst pojawia sie natychmiast w kroju zapasowym i przeskakuje
 * po zaladowaniu. Alternatywa (`block`) oznacza pusty ekran przez pierwsze
 * sekundy na wolnym laczu.
 */
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin", "latin-ext"],
  display: "swap",
  axes: ["SOFT", "WONK", "opsz"],
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Kontora — aplikacja demonstracyjna",
  description:
    "Aplikacja demonstracyjna. Brak realnych pieniedzy. Brak integracji z jakakolwiek instytucja finansowa. Nie wprowadzaj prawdziwych danych osobowych, numerow kart ani hasel uzywanych gdziekolwiek indziej.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // `lang` pochodzi z aktywnego locale, bo czytniki ekranu wybieraja na jego
  // podstawie silnik mowy — polski tekst czytany angielska synteza jest
  // niezrozumialy.
  const { locale, t } = await currentDictionary();

  return (
    <html lang={locale} className={`${fraunces.variable} ${plexSans.variable}`}>
      <body className="min-h-screen antialiased">
        <DemoBanner tytul={t.baner.tytul} tresc={t.baner.tresc} />
        {children}
      </body>
    </html>
  );
}
