-- Zaplecze uwierzytelniania.

-- 1. Sekwencja numerow klienta -----------------------------------------------
--
-- Numer klienta nie jest kolejna wartoscia tej sekwencji — jest jej obrazem po
-- mnozeniu modularnym (src/domain/auth/customer-number.ts). Sekwencja daje
-- wylacznie gwarancje, ze dwie rownolegle rejestracje nie dostana tej samej
-- pozycji wejsciowej. Rozproszeniem zajmuje sie domena, bo to regula produktowa
-- ("numery maja nie byc enumerowalne"), a nie wlasciwosc bazy.
CREATE SEQUENCE IF NOT EXISTS customer_number_seq AS bigint START WITH 1 INCREMENT BY 1;
--> statement-breakpoint

-- 2. Indeksy pod ograniczanie czestotliwosci prob ----------------------------
--
-- Licznik prob czyta log audytu zamiast osobnej tabeli. Zaleta: kazda proba jest
-- juz tam zapisana, wiec nie ma drugiego zrodla prawdy o tym, co sie wydarzylo, i
-- nie ma nowej tabeli do czyszczenia. Koszt: zapytania licznika musza byc tanie,
-- stad te dwa indeksy — bez nich kazda proba logowania skanowalaby caly log.
CREATE INDEX IF NOT EXISTS audit_log_ip_action_idx
  ON audit_log (action, ip, created_at DESC)
  WHERE ip IS NOT NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS audit_log_user_action_idx
  ON audit_log (action, user_id, created_at DESC)
  WHERE user_id IS NOT NULL;
