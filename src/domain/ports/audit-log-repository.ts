import type { AuditEntry, AuditEntryDraft } from "@/domain/audit/audit-log";

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
}
