/**
 * Baner wymagany przez sekcje 14 specyfikacji. Tresc jest dosłowna i nie moze byc
 * skracana ani parafrazowana.
 *
 * Baner jest trwaly: renderuje sie w layoucie glownym, wiec pojawia sie na kazdym
 * ekranie aplikacji i nie da sie go trwale zamknac. Uzywam elementu `role="note"`
 * zamiast `role="alert"`, bo alert wymusilby przerwanie czytnika ekranu przy kazdej
 * nawigacji — informacja jest stala, nie zdarzeniowa.
 *
 * Wyglad jest tymczasowy i celowo neutralny. Warstwa wizualna powstaje w Etapie 3,
 * po zaakceptowaniu planu designu (sekcja 10); pisanie CSS wczesniej byloby
 * przekroczeniem zakresu etapu.
 */
export function DemoBanner() {
  return (
    <div
      role="note"
      aria-label="Informacja o charakterze demonstracyjnym aplikacji"
      className="border-b border-current/20 px-4 py-2 text-sm"
    >
      <p>
        <strong>Aplikacja demonstracyjna.</strong> Brak realnych pieniedzy. Brak
        integracji z jakakolwiek instytucja finansowa. Nie wprowadzaj prawdziwych
        danych osobowych, numerow kart ani hasel uzywanych gdziekolwiek indziej.
      </p>
    </div>
  );
}
