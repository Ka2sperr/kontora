import { createHash, randomBytes } from "node:crypto";
import type { RandomTokenGenerator } from "@/domain/ports/auth";

/**
 * Tokeny odswiezajace.
 *
 * 32 bajty z generatora kryptograficznego — zgadywanie jest bezcelowe, wiec token
 * nie potrzebuje ani podpisu, ani struktury. Jest nieprzezroczystym ciagiem, a cala
 * wiedza o nim mieszka w bazie.
 *
 * W bazie ladauje wylacznie skrot SHA-256. Wyciek kopii bazy nie daje wtedy
 * dzialajacych sesji. Argon2 byloby tu przesada: token ma 256 bitow entropii, wiec
 * nie ma czego zgadywac — spowolnienie chroni hasla wybrane przez ludzi, nie
 * losowe ciagi.
 */
export class CryptoRandomTokenGenerator implements RandomTokenGenerator {
  generate(): string {
    return randomBytes(32).toString("base64url");
  }

  fingerprint(token: string): string {
    return createHash("sha256").update(token, "utf8").digest("hex");
  }
}

export const randomTokenGenerator = new CryptoRandomTokenGenerator();
