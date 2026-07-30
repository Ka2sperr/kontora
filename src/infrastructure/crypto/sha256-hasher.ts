import { createHash } from "node:crypto";
import type { Hasher } from "@/domain/ports/hasher";

export class Sha256Hasher implements Hasher {
  sha256Hex(input: string): string {
    return createHash("sha256").update(input, "utf8").digest("hex");
  }
}

export const sha256Hasher = new Sha256Hasher();
