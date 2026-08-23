import { NextResponse } from "next/server";
import { DomainError } from "@/domain/errors";
import { toErrorBody } from "@/http/errors";
import { ValidationError } from "@/http/validation";

/**
 * Koperta odpowiedzi z sekcji 7: `{ data }` albo `{ error: { code, message } }`.
 *
 * Kwoty ida jako string w jednostkach minor plus kod waluty — nigdy jako liczba.
 * Powod jest ten sam co w calej aplikacji: `JSON.parse` zamienia liczbe na
 * `number`, a `number` gubi grosze powyzej dziewieciu biliardow. Klient dostaje
 * ciag znakow i sam decyduje, czym go uczyni.
 */

export interface MoneyDto {
  readonly amountMinor: string;
  readonly currency: string;
}

export function moneyDto(money: {
  readonly amountMinor: bigint;
  readonly currency: string;
}): MoneyDto {
  return {
    amountMinor: money.amountMinor.toString(),
    currency: money.currency,
  };
}

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ data }, { status: 200, ...init });
}

export function created<T>(data: T): NextResponse {
  return NextResponse.json({ data }, { status: 201 });
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

export function failure(error: unknown): NextResponse {
  const { status, body } = toErrorBody(error);

  return NextResponse.json(body, { status });
}

/**
 * Opakowanie handlera. Zamienia wyjatek na koperte bledu i dopina identyfikator
 * zadania do kazdej odpowiedzi — takze do tej, ktora sie nie udala, bo to wlasnie
 * wtedy jest potrzebny.
 */
export async function handle(
  requestId: string,
  work: () => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    const response = await work();

    response.headers.set("X-Request-Id", requestId);

    return response;
  } catch (error) {
    // Blad domenowy i blad walidacji sa czescia kontraktu API — brak srodkow na
    // koncie nie jest awaria i nie ma zasmiecac logow. Wszystko inne to defekt,
    // ktory MUSI zostawic slad: odpowiedz dla klienta jest celowo ogolna, wiec
    // bez tego wpisu nie ma nigdzie informacji, co sie faktycznie stalo.
    if (!(error instanceof DomainError) && !(error instanceof ValidationError)) {
      console.error(`[${requestId}] nieobsluzony blad zadania`, error);
    }

    const response = failure(error);

    response.headers.set("X-Request-Id", requestId);

    return response;
  }
}
