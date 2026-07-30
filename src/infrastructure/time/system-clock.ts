import type { Clock } from "@/domain/ports/clock";

export const systemClock: Clock = {
  now: () => new Date(),
};
