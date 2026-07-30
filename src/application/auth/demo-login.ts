import {
  AUTH_ACTIONS,
  type AuthDeps,
  type RequestContext,
} from "@/application/auth/deps";
import { type LoginResult, login } from "@/application/auth/login";
import { allocateCustomerNumber } from "@/application/auth/allocate-customer-number";

/**
 * Konto demonstracyjne.
 *
 * Dane sa jawne i wpisane w kod, bo caly sens tego konta polega na tym, ze kazdy
 * moze sie na nie zalogowac. Ukrywanie ich byloby udawaniem bezpieczenstwa —
 * konto nie ma nic do stracenia i tak jest zaprojektowane.
 */
export const DEMO_PASSWORD = "demo-kontora-2026";
export const DEMO_PIN = "1234";
export const DEMO_EMAIL = "demo@kontora.invalid";

export interface DemoCredentials {
  readonly customerNumber: string;
  readonly password: string;
  readonly pin: string;
}

export interface DemoLoginResult extends LoginResult {
  readonly credentials: DemoCredentials;
}

/**
 * Logowanie na konto demo w jednym strzale.
 *
 * Konto powstaje przy pierwszym uzyciu, a potem jest tylko odnajdywane. Samo
 * logowanie idzie **normalna sciezka** — tym samym `login`, z tym samym
 * sprawdzeniem hasla, tym samym wpisem w logu audytu i ta sama rotacja tokenow.
 * Skrot omijajacy `login` bylby latwiejszy, ale wtedy przycisk demo pokazywalby
 * cos, czego w aplikacji nie ma.
 */
export async function demoLogin(
  deps: AuthDeps,
  context: RequestContext,
): Promise<DemoLoginResult> {
  const existing = await deps.uow.run((repos) => repos.users.findDemoUser());

  const customerNumber =
    existing?.customerNumber ?? (await createDemoUser(deps, context));

  const result = await login(
    deps,
    { customerNumber, password: DEMO_PASSWORD },
    context,
  );

  return {
    ...result,
    credentials: {
      customerNumber,
      password: DEMO_PASSWORD,
      pin: DEMO_PIN,
    },
  };
}

async function createDemoUser(
  deps: AuthDeps,
  context: RequestContext,
): Promise<string> {
  const passwordHash = await deps.hasher.hash(DEMO_PASSWORD);
  const pinHash = await deps.hasher.hash(DEMO_PIN);

  return deps.uow.run(async (repos) => {
    // Wyscig jest mozliwy: dwa pierwsze klikniecia naraz. Ograniczenie UNIQUE na
    // adresie e-mail rozstrzyga go po stronie bazy, a przegrany po prostu czyta
    // konto zwyciezcy.
    const raced = await repos.users.findDemoUser();

    if (raced !== null) {
      return raced.customerNumber;
    }

    const customerNumber = await allocateCustomerNumber(repos.users);

    const user = await repos.users.create({
      customerNumber,
      passwordHash,
      pinHash,
      firstName: "Anna",
      lastName: "Demo",
      email: DEMO_EMAIL,
      isDemo: true,
    });

    await repos.audit.append({
      userId: user.id,
      action: AUTH_ACTIONS.registered,
      entity: "user",
      entityId: user.id,
      metadata: { customerNumber, demo: true },
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return customerNumber;
  });
}
