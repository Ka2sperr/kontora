-- Straznicy ksiegi. Dwie zasady, ktorych nie da sie obejsc kodem aplikacji:
-- ksiega jest tylko do dopisywania, a zapisy kazdej transakcji sumuja sie do zera
-- osobno w kazdej walucie.
--
-- Te reguly zyja w bazie, a nie w warstwie aplikacji, bo baza jest jedynym
-- miejscem, przez ktore przechodza wszyscy: aplikacja, migracja, skrypt
-- serwisowy i czlowiek z psql o drugiej w nocy.

-- 1. Zakaz modyfikacji i usuwania -------------------------------------------

CREATE OR REPLACE FUNCTION kontora_forbid_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'Tabela % jest tylko do dopisywania. Operacja % jest zabroniona.',
    TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint

-- Wyzwalacze sa poziomu instrukcji, nie wiersza. Dzieki temu `DELETE FROM
-- ledger_entries WHERE false` tez konczy sie bledem: intencja usuniecia z ksiegi
-- jest bledem niezaleznie od tego, ile wierszy trafil warunek.
CREATE TRIGGER ledger_entries_append_only
  BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH STATEMENT EXECUTE FUNCTION kontora_forbid_mutation();
--> statement-breakpoint

-- TRUNCATE nie jest ani UPDATE, ani DELETE i przechodzi obok powyzszego
-- wyzwalacza. Bez tej klauzuli cala ksiege da sie skasowac jednym poleceniem.
CREATE TRIGGER ledger_entries_no_truncate
  BEFORE TRUNCATE ON ledger_entries
  FOR EACH STATEMENT EXECUTE FUNCTION kontora_forbid_mutation();
--> statement-breakpoint

CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION kontora_forbid_mutation();
--> statement-breakpoint

CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION kontora_forbid_mutation();
--> statement-breakpoint

-- 2. Niezmiennik sumy zerowej ------------------------------------------------

CREATE OR REPLACE FUNCTION kontora_assert_transaction_balanced() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  unbalanced RECORD;
BEGIN
  SELECT le.currency, SUM(le.amount_minor) AS total
    INTO unbalanced
  FROM ledger_entries le
  WHERE le.transaction_id = NEW.transaction_id
  GROUP BY le.currency
  HAVING SUM(le.amount_minor) <> 0
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'Transakcja % nie bilansuje sie w walucie %: suma zapisow wynosi %.',
      NEW.transaction_id, unbalanced.currency, unbalanced.total
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NULL;
END;
$$;
--> statement-breakpoint

-- Sprawdzenie MUSI byc odroczone do COMMIT. W trakcie wstawiania kolejnych
-- zapisow transakcja jest z definicji chwilowo niezbilansowana — po pierwszym
-- INSERT suma wynosi tyle, ile ten jeden zapis. Natychmiastowy wyzwalacz
-- odrzucalby kazda poprawna transakcje.
CREATE CONSTRAINT TRIGGER ledger_entries_balanced
  AFTER INSERT ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION kontora_assert_transaction_balanced();
--> statement-breakpoint

-- 3. Konta wewnetrzne banku --------------------------------------------------
--
-- Nie sa danymi demonstracyjnymi, tylko czescia struktury: bez konta
-- rozrachunkowego przelew zewnetrzny nie ma drugiej strony, a bez konta pozycji
-- walutowej nie da sie zaksiegowac przewalutowania. Dlatego powstaja w migracji,
-- a nie w seederze, ktory mozna pominac.
--
-- Identyfikatory sa wpisane wprost i deterministyczne, zeby srodowisko
-- deweloperskie, CI i produkcja mialy te same konta wewnetrzne — inaczej
-- porownanie zrzutow bazy miedzy srodowiskami nic nie mowi.
--
-- Odstepstwo od sekcji 5.1 specyfikacji: sa tu takze BANK_SETTLEMENT_EUR i
-- BANK_SETTLEMENT_USD, choc dokument wymienia tylko wersje PLN. Klient moze miec
-- konto walutowe, a przelew zewnetrzny z niego musialby wyjsc przez konto
-- rozrachunkowe w tej samej walucie — inaczej ksiega mialaby dziure albo trzeba
-- by odrzucac operacje z powodu brakujacego wiersza w tabeli.

INSERT INTO accounts (id, user_id, internal_code, iban, currency, kind, display_name, status)
VALUES
  ('00000000-0000-4000-8000-000000000001', NULL, 'BANK_SETTLEMENT_PLN', NULL, 'PLN', 'internal', 'Rozrachunki miedzybankowe PLN', 'active'),
  ('00000000-0000-4000-8000-000000000002', NULL, 'BANK_FEE_INCOME_PLN', NULL, 'PLN', 'internal', 'Przychody z oplat i marz', 'active'),
  ('00000000-0000-4000-8000-000000000003', NULL, 'BANK_CREDIT_LINE_PLN', NULL, 'PLN', 'internal', 'Finansowanie kart kredytowych', 'active'),
  ('00000000-0000-4000-8000-000000000010', NULL, 'BANK_FX_POSITION_PLN', NULL, 'PLN', 'internal', 'Pozycja walutowa PLN', 'active'),
  ('00000000-0000-4000-8000-000000000011', NULL, 'BANK_FX_POSITION_EUR', NULL, 'EUR', 'internal', 'Pozycja walutowa EUR', 'active'),
  ('00000000-0000-4000-8000-000000000012', NULL, 'BANK_FX_POSITION_USD', NULL, 'USD', 'internal', 'Pozycja walutowa USD', 'active'),
  ('00000000-0000-4000-8000-000000000013', NULL, 'BANK_FX_POSITION_GBP', NULL, 'GBP', 'internal', 'Pozycja walutowa GBP', 'active'),
  ('00000000-0000-4000-8000-000000000014', NULL, 'BANK_FX_POSITION_CHF', NULL, 'CHF', 'internal', 'Pozycja walutowa CHF', 'active'),
  ('00000000-0000-4000-8000-000000000015', NULL, 'BANK_FX_POSITION_CZK', NULL, 'CZK', 'internal', 'Pozycja walutowa CZK', 'active'),
  ('00000000-0000-4000-8000-000000000016', NULL, 'BANK_FX_POSITION_NOK', NULL, 'NOK', 'internal', 'Pozycja walutowa NOK', 'active'),
  ('00000000-0000-4000-8000-000000000017', NULL, 'BANK_FX_POSITION_SEK', NULL, 'SEK', 'internal', 'Pozycja walutowa SEK', 'active'),
  ('00000000-0000-4000-8000-000000000020', NULL, 'BANK_SETTLEMENT_EUR', NULL, 'EUR', 'internal', 'Rozrachunki miedzybankowe EUR', 'active'),
  ('00000000-0000-4000-8000-000000000021', NULL, 'BANK_SETTLEMENT_USD', NULL, 'USD', 'internal', 'Rozrachunki miedzybankowe USD', 'active')
ON CONFLICT (internal_code) DO NOTHING;
