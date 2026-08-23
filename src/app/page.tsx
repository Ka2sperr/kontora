import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Logowanie } from "@/components/logowanie";
import { ACCESS_COOKIE } from "@/http/session";
import { accessTokenService } from "@/infrastructure/container";
import { currentDictionary } from "@/i18n/server";

export const dynamic = "force-dynamic";

export default async function StronaLogowania() {
  const { t } = await currentDictionary();

  // Zalogowany uzytkownik nie oglada formularza logowania. Sprawdzenie idzie
  // przez weryfikacje tokena, a nie przez samo istnienie ciasteczka — wygasly
  // token wyladowalby w petli przekierowan.
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;

  if (token !== undefined && (await accessTokenService.verify(token)) !== null) {
    redirect("/pulpit");
  }

  return (
    <main className="mx-auto grid max-w-6xl gap-12 px-4 py-12 lg:grid-cols-[1fr_26rem]">
      <section className="max-w-xl">
        <h1 className="font-naglowek text-4xl sm:text-5xl">
          {t.wspolne.nazwaMarki}
        </h1>
        <p className="mt-4 text-lg text-atrament-slaby">
          Demonstracyjny bank oparty o ksiege podwojnego zapisu. Kazda operacja ma
          dwie strony, ktore sie znosza — i mozesz to zobaczyc w historii kazdego
          konta.
        </p>

        <dl className="mt-8 grid gap-4 border-t border-linia pt-6 text-sm">
          <div>
            <dt className="font-medium">Ksiega, nie kolumna z saldem</dt>
            <dd className="text-atrament-slaby">
              Saldo jest suma zapisow. Nie da sie go nadpisac, bo nie ma czego
              nadpisywac.
            </dd>
          </div>
          <div>
            <dt className="font-medium">PIN potwierdza, nie loguje</dt>
            <dd className="text-atrament-slaby">
              Cztery cyfry sa za slabe na czynnik logowania. Podnosza sesje na piec
              minut przy operacji — model PSD2 SCA.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Dwiescie rownoleglych przelewow</dt>
            <dd className="text-atrament-slaby">
              Test w repozytorium dowodzi, ze pieniadze ani nie gina, ani sie nie
              mnoza.
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-ostry border border-linia bg-papier-wglebienie p-6">
        <h2 className="font-naglowek text-2xl">{t.logowanie.tytul}</h2>
        <div className="mt-6">
          <Logowanie t={t} />
        </div>
      </section>
    </main>
  );
}
