/**
 * Generator identyfikatorow. Wstrzykiwany z tego samego powodu co `Clock`:
 * deterministyczny seeder i przewidywalne asercje w testach.
 */
export interface IdGenerator {
  uuid(): string;
}
