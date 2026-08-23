"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { useId } from "react";

/**
 * Pola formularza z etykieta powiazana przez `id`.
 *
 * Etykieta jest zawsze widoczna, nigdy nie jest zastapiona placeholderem.
 * Placeholder znika po pierwszym znaku, wiec uzytkownik, ktory sie rozproszyl,
 * traci informacje, co wpisuje — a osoba korzystajaca z czytnika ekranu nie
 * dostaje jej wcale.
 */
export function Pole({
  label,
  hint,
  error,
  ...props
}: {
  readonly label: string;
  readonly hint?: string | undefined;
  readonly error?: string | undefined;
} & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const hintId = `${id}-opis`;
  const errorId = `${id}-blad`;

  const describedBy = [hint === undefined ? null : hintId, error === undefined ? null : errorId]
    .filter((value): value is string => value !== null)
    .join(" ");

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        {...props}
        id={id}
        aria-describedby={describedBy.length === 0 ? undefined : describedBy}
        aria-invalid={error === undefined ? undefined : true}
        className="rounded-ostry border border-linia bg-papier px-3 py-2 text-base
                   focus-visible:border-niebieski"
      />
      {hint === undefined ? null : (
        <p id={hintId} className="text-xs text-atrament-slaby">
          {hint}
        </p>
      )}
      {error === undefined ? null : (
        // `role="alert"` tylko na bledzie pola: to jest zdarzenie, o ktorym
        // czytnik ekranu ma powiedziec od razu, bo blokuje dalsze dzialanie.
        <p id={errorId} role="alert" className="text-sm text-stempel">
          {error}
        </p>
      )}
    </div>
  );
}

export function Przycisk({
  children,
  wariant = "glowny",
  ...props
}: {
  readonly children: ReactNode;
  readonly wariant?: "glowny" | "drugi" | "cichy";
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const style =
    wariant === "glowny"
      ? "bg-niebieski text-papier hover:opacity-90"
      : wariant === "drugi"
        ? "border border-linia bg-papier hover:bg-papier-wglebienie"
        : "text-niebieski underline underline-offset-4 hover:opacity-80";

  return (
    <button
      {...props}
      className={`rounded-ostry px-4 py-2 text-sm font-medium transition-opacity
                  disabled:cursor-not-allowed disabled:opacity-50 ${style}`}
    >
      {children}
    </button>
  );
}

export function Komunikat({ tresc }: { readonly tresc: string }) {
  return (
    <p
      role="alert"
      className="rounded-ostry border border-stempel/40 bg-stempel/5 px-3 py-2 text-sm text-stempel"
    >
      {tresc}
    </p>
  );
}
