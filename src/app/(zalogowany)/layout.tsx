import Link from "next/link";
import { redirect } from "next/navigation";
import { currentDictionary } from "@/i18n/server";
import { Wyloguj } from "@/components/wyloguj";
import { wymagajSesji } from "@/app/sesja";

export const dynamic = "force-dynamic";

/**
 * Ramka zalogowanej czesci aplikacji: szyna z kontami po lewej, tresc po prawej.
 *
 * Zero cieni i zero kart. Podzial buduja linie wlosowe — arkusz ksiegi, nie
 * pulpit z kafelkami (Etap 3).
 */
export default async function LayoutZalogowany({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const sesja = await wymagajSesji();

  if (sesja === null) {
    redirect("/");
  }

  const { t } = await currentDictionary();

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <header className="flex items-baseline justify-between border-b border-linia pb-4">
        <Link href="/pulpit" className="font-naglowek text-2xl">
          {t.wspolne.nazwaMarki}
        </Link>
        <Wyloguj etykieta={t.wspolne.wyloguj} />
      </header>
      {children}
    </div>
  );
}
