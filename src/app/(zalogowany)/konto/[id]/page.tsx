import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { wymagajSesji } from "@/app/sesja";
import { Historia } from "@/components/historia";
import { KwotaGlowna } from "@/components/kwota";
import { accountId } from "@/domain/ids";
import { moneyDto } from "@/http/response";
import { accountQueries } from "@/infrastructure/container";
import { currentDictionary } from "@/i18n/server";
import { formatIban } from "@/i18n/format";

export const dynamic = "force-dynamic";

const STRONA = 25;

export default async function StronaKonta({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const sesja = await wymagajSesji();

  if (sesja === null) {
    redirect("/");
  }

  const { locale, t } = await currentDictionary();
  const { id } = await params;

  // Zapytanie filtruje po wlascicielu, wiec cudze konto zwraca `null` i konczy sie
  // stroną 404 — taka sama jak dla konta, ktore nie istnieje.
  const konto = await accountQueries.findForUser(sesja.userId, accountId(id));

  if (konto === null) {
    notFound();
  }

  const historia = await accountQueries.listTransactions({
    accountId: konto.id,
    limit: STRONA,
  });

  const dostepne =
    konto.creditLimit === null
      ? konto.balance
      : {
          amountMinor: konto.balance.amountMinor + konto.creditLimit.amountMinor,
          currency: konto.currency,
        };

  return (
    <main className="py-8">
      <nav className="mb-6 text-sm">
        <Link href="/pulpit" className="text-niebieski underline underline-offset-4">
          {t.pulpit.tytul}
        </Link>
      </nav>

      <header className="border-b border-linia pb-6">
        <h1 className="font-naglowek text-2xl">{konto.displayName}</h1>
        <p className="mt-1 text-xs text-atrament-slaby">
          {t.konta[konto.kind]}
          {konto.iban === null ? null : ` · ${formatIban(konto.iban)}`}
        </p>

        <dl className="mt-6 flex flex-wrap gap-x-12 gap-y-4">
          <div>
            <dt className="text-xs uppercase tracking-wide text-atrament-slaby">
              {t.konto.saldo}
            </dt>
            <dd className="mt-1">
              <KwotaGlowna value={moneyDto(konto.balance)} locale={locale} />
            </dd>
          </div>
          {konto.creditLimit === null ? null : (
            <div>
              <dt className="text-xs uppercase tracking-wide text-atrament-slaby">
                {t.konto.dostepneSrodki}
              </dt>
              <dd className="mt-1">
                <KwotaGlowna value={moneyDto(dostepne)} locale={locale} />
              </dd>
            </div>
          )}
        </dl>
      </header>

      <section aria-labelledby="historia" className="pt-8">
        <h2 id="historia" className="font-naglowek text-xl">
          {t.konto.historia}
        </h2>

        <div className="mt-4">
          <Historia
            accountId={konto.id}
            locale={locale}
            t={t}
            poczatkowyKursor={historia.nextCursor}
            poczatkowe={historia.items.map((item) => ({
              id: item.id,
              title: item.title,
              counterpartyName: item.counterpartyName,
              category: item.category,
              merchant: item.merchant,
              bookedAt: item.bookedAt.toISOString(),
              amount: moneyDto(item.amount),
              entries: item.entries.map((entry) => ({
                accountId: entry.accountId,
                accountName: entry.accountName,
                amount: moneyDto(entry.amount),
              })),
            }))}
          />
        </div>
      </section>
    </main>
  );
}
