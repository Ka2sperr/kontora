import argon2 from "argon2";
import type { PasswordHasher } from "@/domain/ports/auth";

/**
 * Parametry Argon2id.
 *
 * 64 MiB pamieci i trzy przebiegi to wartosci z okolic zalecen OWASP. Kluczowy
 * jest koszt pamieciowy: to on sprawia, ze atak na karcie graficznej przestaje sie
 * oplacac, bo tysiace rdzeni nie maja gdzie trzymac swoich 64 MiB. Sam koszt
 * czasowy da sie zrownoleglic, koszt pamieciowy nie.
 *
 * Parametry sa zapisane w samym hashu, wiec ich pozniejsza zmiana nie uniewaznia
 * istniejacych hasel — stare weryfikuja sie swoimi wartosciami, a `needsRehash`
 * wskazuje te, ktore warto przeliczyc przy najblizszym logowaniu.
 */
const OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 4,
} as const;

export class Argon2PasswordHasher implements PasswordHasher {
  hash(plaintext: string): Promise<string> {
    return argon2.hash(plaintext, OPTIONS);
  }

  async verify(hash: string, plaintext: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plaintext);
    } catch {
      // Uszkodzony lub obcy format hasha to nie awaria serwera, tylko nieudana
      // weryfikacja. Rzucenie wyjatkiem odroznialoby "zly hash w bazie" od "zle
      // haslo" w odpowiedzi HTTP, czyli zdradzaloby stan konta.
      return false;
    }
  }

  needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, OPTIONS);
  }
}

export const argon2PasswordHasher = new Argon2PasswordHasher();
