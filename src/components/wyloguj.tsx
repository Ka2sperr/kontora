"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Wylogowanie.
 *
 * Zwykly formularz `POST` na endpoint pokazalby uzytkownikowi surowy JSON, bo
 * route handler zwraca koperte danych, a nie przekierowanie. Endpoint zostaje
 * czescia API — to interfejs ma wiedziec, dokad isc po wylogowaniu.
 */
export function Wyloguj({ etykieta }: { readonly etykieta: string }) {
  const router = useRouter();
  const [pracuje, setPracuje] = useState(false);

  return (
    <button
      type="button"
      disabled={pracuje}
      onClick={() => {
        setPracuje(true);

        void fetch("/api/auth/logout", { method: "POST" })
          .catch(() => {
            // Nawet gdy zadanie nie doszlo, uzytkownik ma wyladowac na ekranie
            // logowania. Token dostepu i tak wygasnie, a zostawienie go na
            // pulpicie po klinieciu "Wyloguj" byloby myleniem go co do stanu.
          })
          .finally(() => {
            router.replace("/");
            router.refresh();
          });
      }}
      className="text-sm text-niebieski underline underline-offset-4 disabled:opacity-50"
    >
      {etykieta}
    </button>
  );
}
