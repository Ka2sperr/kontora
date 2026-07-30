import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import type { RequestContext } from "@/application/auth/deps";

/**
 * Identyfikator zadania. Przychodzi z zewnatrz, jesli klient go podal, inaczej
 * powstaje tutaj. Trafia do naglowka odpowiedzi i do metadanych logu audytu, wiec
 * zgloszenie "o 14:32 przelew nie przeszedl" da sie zamienic w jeden wiersz.
 */
export function requestIdOf(request: NextRequest): string {
  const provided = request.headers.get("x-request-id");

  return provided !== null && provided.length <= 128 ? provided : randomUUID();
}

/**
 * Adres klienta. Za odwrotnym proxy (Vercel) prawdziwy adres jest w
 * `x-forwarded-for`, a `request.ip` wskazuje na proxy.
 *
 * Brany jest **pierwszy** wpis naglowka, bo kolejne dopisuja posrednicy. Uwaga na
 * zaufanie: klient moze podac dowolne `x-forwarded-for`, wiec ta wartosc nadaje
 * sie do pokazania uzytkownikowi i do zgrubnego ograniczania ruchu, ale nie do
 * decyzji o dostepie.
 */
export function clientIpOf(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");

  if (forwarded !== null) {
    const first = forwarded.split(",")[0]?.trim();

    if (first !== undefined && first.length > 0) {
      return first.slice(0, 64);
    }
  }

  return request.headers.get("x-real-ip");
}

export function contextOf(request: NextRequest): RequestContext {
  return {
    ip: clientIpOf(request),
    userAgent: request.headers.get("user-agent")?.slice(0, 512) ?? null,
  };
}
