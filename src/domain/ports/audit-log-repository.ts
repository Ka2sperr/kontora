import type { AuditEntry, AuditEntryDraft } from "@/domain/audit/audit-log";
import type { UserId } from "@/domain/ids";

export interface AuditLogRepository {
  /**
   * Dopisuje wpis na koniec lancucha.
   *
   * Implementacja musi zapewnic, ze dwa rownolegle dopisania nie zbuduja dwoch
   * galezi od tego samego poprzednika. To swiadome waskie gardlo: log audytu
   * zapisuje sie szeregowo, bo lancuch bez jednoznacznej kolejnosci nie jest
   * lancuchem.
   */
  append(draft: AuditEntryDraft): Promise<AuditEntry>;

  /** Wpisy w kolejnosci rosnacego `seq` — jedynej, w ktorej lancuch ma sens. */
  all(): Promise<readonly AuditEntry[]>;

  /**
   * Ostatnie wpisy uzytkownika o podanych akcjach, od najnowszych. Zasila ekran
   * historii logowan — dlatego czyta z logu audytu, a nie z osobnej tabeli:
   * dwa rejestry tych samych zdarzen musialyby sie zgadzac, a nic by tego nie
   * pilnowalo.
   */
  recentForUser(input: {
    readonly userId: UserId;
    readonly actions: readonly string[];
    readonly limit: number;
  }): Promise<readonly AuditEntry[]>;
}
