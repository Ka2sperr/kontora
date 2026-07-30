import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/infrastructure/db/client";

export const dynamic = "force-dynamic";

/**
 * Sprawdzenie zdrowia. Pyta baze, a nie tylko odpowiada "ok" — endpoint, ktory
 * zwraca sukces przy niedostepnej bazie, informuje wylacznie o tym, ze proces
 * Node'a zyje, czyli o rzeczy, ktorej nikt nie potrzebuje wiedziec.
 */
export async function GET(): Promise<NextResponse> {
  try {
    await db.execute(sql`select 1`);

    return NextResponse.json({ data: { status: "ok", database: "ok" } });
  } catch {
    return NextResponse.json(
      { error: { code: "DATABASE_UNAVAILABLE", message: "Baza danych nie odpowiada." } },
      { status: 503 },
    );
  }
}
