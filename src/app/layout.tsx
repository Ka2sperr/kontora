import type { Metadata } from "next";
import { DemoBanner } from "@/components/demo-banner";
import "./globals.css";

/**
 * Brak importow fontow. Typografia to decyzja projektowa z Etapu 3, ktora zgodnie
 * z sekcja 10 wymaga wczesniejszej akceptacji planu designu — domyslny Geist ze
 * scaffoldu bylby taka decyzja podjeta po cichu.
 */

export const metadata: Metadata = {
  title: "Kontora — aplikacja demonstracyjna",
  description:
    "Aplikacja demonstracyjna. Brak realnych pieniedzy. Brak integracji z jakakolwiek instytucja finansowa. Nie wprowadzaj prawdziwych danych osobowych, numerow kart ani hasel uzywanych gdziekolwiek indziej.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // `lang="pl"` az do wprowadzenia i18n w Etapie 3 — wtedy wartosc bedzie
  // pochodzic z aktywnego locale, bo czytniki ekranu wybieraja na jej podstawie
  // silnik mowy.
  return (
    <html lang="pl">
      <body className="antialiased">
        <DemoBanner />
        {children}
      </body>
    </html>
  );
}
