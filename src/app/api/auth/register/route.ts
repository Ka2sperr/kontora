import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { register } from "@/application/auth/register";
import { authDeps } from "@/infrastructure/container";
import { contextOf, requestIdOf } from "@/http/request-context";
import { created, handle } from "@/http/response";
import { parseBody, safeText } from "@/http/validation";

export const dynamic = "force-dynamic";

/**
 * Rejestracja nie przyjmuje PESEL-u, numeru dokumentu ani adresu (sekcja 14).
 * Schemat jest tego dowodem: pola, ktorego nie ma w schemacie, nie da sie
 * przypadkiem zapisac.
 */
const schema = z.object({
  firstName: safeText(64),
  lastName: safeText(64),
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(256),
  pin: z.string().regex(/^\d{4,6}$/).optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = requestIdOf(request);

  return handle(requestId, async () => {
    const body = await parseBody(request, schema);
    const result = await register(authDeps, body, contextOf(request));

    return created(result);
  });
}
