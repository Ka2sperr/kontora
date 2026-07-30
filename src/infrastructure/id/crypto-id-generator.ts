import { randomUUID } from "node:crypto";
import type { IdGenerator } from "@/domain/ports/id-generator";

export const cryptoIdGenerator: IdGenerator = {
  uuid: () => randomUUID(),
};
