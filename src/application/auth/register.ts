import {
  AUTH_ACTIONS,
  type AuthDeps,
  type RequestContext,
} from "@/application/auth/deps";
import { allocateCustomerNumber } from "@/application/auth/allocate-customer-number";
import {
  assertPasswordShape,
  assertPinShape,
  describeRejection,
} from "@/domain/auth/password";
import { DomainError } from "@/domain/errors";

export interface RegisterInput {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly password: string;
  /** Opcjonalny przy rejestracji; bez niego konto dziala, ale nie wykona przelewu. */
  readonly pin?: string | undefined;
}

export interface RegisterResult {
  readonly customerNumber: string;
  /**
   * Czy sprawdzenie w bazie wyciekow faktycznie sie odbylo. Interfejs pokazuje to
   * uzytkownikowi zamiast milczec — obietnica "sprawdzilismy twoje haslo", ktora
   * czasem nie jest prawda, jest gorsza niz brak obietnicy.
   */
  readonly breachCheckPerformed: boolean;
}

/**
 * Rejestracja.
 *
 * Nie zbiera PESEL-u, numeru dokumentu ani adresu — wymog sekcji 14. Aplikacja
 * demonstracyjna nie ma powodu dotykac danych, ktorych nie umie chronic, a
 * najlepszym sposobem na nieprzechowywanie danych jest ich nieprzyjmowanie.
 */
export async function register(
  deps: AuthDeps,
  input: RegisterInput,
  context: RequestContext,
): Promise<RegisterResult> {
  assertPasswordShape(input.password);

  if (input.pin !== undefined) {
    assertPinShape(input.pin);
  }

  // Sprawdzenie w bazie wyciekow i hashowanie ida PRZED otwarciem transakcji.
  // Jedno czeka na cudzy serwer, drugie celowo zajmuje 64 MiB i kilkadziesiat
  // milisekund procesora — trzymanie w tym czasie otwartej transakcji zamienia
  // rejestracje w blokade dla wszystkich innych.
  const occurrences = await deps.breachedPasswords.occurrences(input.password);
  const breachCheckPerformed = true;

  if (occurrences > 0) {
    throw new DomainError(
      "WEAK_PASSWORD",
      describeRejection({ reason: "breached", occurrences }),
    );
  }

  const passwordHash = await deps.hasher.hash(input.password);
  const pinHash =
    input.pin === undefined ? null : await deps.hasher.hash(input.pin);

  return deps.uow.run(async (repos) => {
    const customerNumber = await allocateCustomerNumber(repos.users);

    const user = await repos.users.create({
      customerNumber,
      passwordHash,
      pinHash,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email.toLowerCase(),
      isDemo: false,
    });

    await repos.audit.append({
      userId: user.id,
      action: AUTH_ACTIONS.registered,
      entity: "user",
      entityId: user.id,
      // Ani hasla, ani PIN-u, ani ich skrotow. Log audytu jest czytany przez
      // ludzi i wysylany do systemow monitoringu — wszystko, co w nim jest, nalezy
      // uznac za mogace wyciec.
      metadata: { customerNumber, breachCheckPerformed },
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return { customerNumber, breachCheckPerformed };
  });
}
