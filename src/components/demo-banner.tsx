/**
 * Baner wymagany przez sekcje 14. Tresc jest doslowna i nie moze byc skracana ani
 * parafrazowana — dostaje ja z warstwy i18n, zeby wersja angielska niosla to samo
 * ostrzezenie, a nie zadne.
 *
 * Baner jest trwaly: renderuje sie w layoucie glownym, wiec pojawia sie na kazdym
 * ekranie i nie da sie go zamknac. `role="note"` zamiast `role="alert"`, bo alert
 * przerywalby czytnik ekranu przy kazdej nawigacji — informacja jest stala, nie
 * zdarzeniowa.
 */
export function DemoBanner({
  tytul,
  tresc,
}: {
  readonly tytul: string;
  readonly tresc: string;
}) {
  return (
    <div
      role="note"
      aria-label={tytul}
      className="border-b border-linia bg-papier-wglebienie px-4 py-2 text-sm text-atrament-slaby"
    >
      <p className="mx-auto max-w-6xl">
        <strong className="text-stempel">{tytul}</strong> {tresc}
      </p>
    </div>
  );
}
