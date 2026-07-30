CREATE TYPE "public"."account_kind" AS ENUM('checking', 'savings', 'credit', 'internal');--> statement-breakpoint
CREATE TYPE "public"."account_status" AS ENUM('active', 'frozen', 'closed');--> statement-breakpoint
CREATE TYPE "public"."card_kind" AS ENUM('debit', 'credit', 'virtual');--> statement-breakpoint
CREATE TYPE "public"."card_limit_channel" AS ENUM('online', 'contactless', 'atm', 'foreign');--> statement-breakpoint
CREATE TYPE "public"."card_limit_period" AS ENUM('daily', 'monthly', 'per_transaction');--> statement-breakpoint
CREATE TYPE "public"."card_status" AS ENUM('active', 'frozen', 'blocked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."transaction_kind" AS ENUM('internal_transfer', 'external_transfer', 'card_payment', 'fx_exchange', 'incoming', 'fee', 'interest');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('pending', 'booked', 'rejected', 'reversed');--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"parent_id" uuid,
	"token_hash" text NOT NULL,
	"used_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_number" char(8) NOT NULL,
	"password_hash" text NOT NULL,
	"pin_hash" text,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"password_failed" integer DEFAULT 0 NOT NULL,
	"password_locked_until" timestamp with time zone,
	"pin_failed" integer DEFAULT 0 NOT NULL,
	"pin_locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_customerNumber_unique" UNIQUE("customer_number"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"internal_code" text,
	"iban" char(28),
	"currency" char(3) NOT NULL,
	"kind" "account_kind" NOT NULL,
	"display_name" text NOT NULL,
	"balance_cached_minor" bigint DEFAULT 0 NOT NULL,
	"credit_limit_minor" bigint,
	"status" "account_status" DEFAULT 'active' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_internalCode_unique" UNIQUE("internal_code"),
	CONSTRAINT "accounts_iban_unique" UNIQUE("iban"),
	CONSTRAINT "accounts_id_currency_key" UNIQUE("id","currency"),
	CONSTRAINT "accounts_currency_iso4217" CHECK ("accounts"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "accounts_owner_matches_kind" CHECK (("accounts"."kind" = 'internal' and "accounts"."user_id" is null and "accounts"."internal_code" is not null)
          or ("accounts"."kind" <> 'internal' and "accounts"."user_id" is not null and "accounts"."internal_code" is null)),
	CONSTRAINT "accounts_credit_limit_only_for_credit" CHECK (("accounts"."kind" = 'credit' and "accounts"."credit_limit_minor" is not null and "accounts"."credit_limit_minor" >= 0)
          or ("accounts"."kind" <> 'credit' and "accounts"."credit_limit_minor" is null))
);
--> statement-breakpoint
CREATE TABLE "fx_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_type" char(1) NOT NULL,
	"table_no" text NOT NULL,
	"currency" char(3) NOT NULL,
	"mid_minor" bigint,
	"bid_minor" bigint,
	"ask_minor" bigint,
	"effective_date" date NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fx_rates_type_currency_date_key" UNIQUE("table_type","currency","effective_date"),
	CONSTRAINT "fx_rates_table_type" CHECK ("fx_rates"."table_type" in ('A', 'C')),
	CONSTRAINT "fx_rates_shape_matches_table" CHECK (("fx_rates"."table_type" = 'A' and "fx_rates"."mid_minor" is not null)
          or ("fx_rates"."table_type" = 'C' and "fx_rates"."bid_minor" is not null and "fx_rates"."ask_minor" is not null))
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"transaction_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"currency" char(3) NOT NULL,
	"amount_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_amount_not_zero" CHECK ("ledger_entries"."amount_minor" <> 0)
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"kind" "transaction_kind" NOT NULL,
	"status" "transaction_status" DEFAULT 'booked' NOT NULL,
	"initiated_by" uuid,
	"fx_rate_id" uuid,
	"title" text NOT NULL,
	"counterparty_name" text,
	"counterparty_iban" char(28),
	"category" text,
	"merchant" text,
	"booked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_idempotencyKey_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "card_limits" (
	"card_id" uuid NOT NULL,
	"channel" "card_limit_channel" NOT NULL,
	"period" "card_limit_period" NOT NULL,
	"amount_minor" bigint NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "card_limits_card_id_channel_period_pk" PRIMARY KEY("card_id","channel","period"),
	CONSTRAINT "card_limits_amount_non_negative" CHECK ("card_limits"."amount_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"pan_encrypted" "bytea" NOT NULL,
	"pan_last4" char(4) NOT NULL,
	"bin" char(6) NOT NULL,
	"brand" text DEFAULT 'DemoCard' NOT NULL,
	"kind" "card_kind" NOT NULL,
	"expiry_month" integer NOT NULL,
	"expiry_year" integer NOT NULL,
	"cvv_encrypted" "bytea" NOT NULL,
	"status" "card_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cards_test_bin_only" CHECK ("cards"."bin" ~ '^9[0-9]{5}$'),
	CONSTRAINT "cards_expiry_month_range" CHECK ("cards"."expiry_month" between 1 and 12)
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"entity" text,
	"entity_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" text,
	"user_agent" text,
	"prev_hash" char(64) NOT NULL,
	"hash" char(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_log_hash_unique" UNIQUE("hash")
);
--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_currency_fk" FOREIGN KEY ("account_id","currency") REFERENCES "public"."accounts"("id","currency") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_initiated_by_users_id_fk" FOREIGN KEY ("initiated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_fx_rate_id_fx_rates_id_fk" FOREIGN KEY ("fx_rate_id") REFERENCES "public"."fx_rates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_limits" ADD CONSTRAINT "card_limits_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_family_idx" ON "refresh_tokens" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "fx_rates_lookup_idx" ON "fx_rates" USING btree ("currency","table_type","effective_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ledger_entries_transaction_idx" ON "ledger_entries" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_account_idx" ON "ledger_entries" USING btree ("account_id","id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "transactions_booked_at_idx" ON "transactions" USING btree ("booked_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "transactions_initiated_by_idx" ON "transactions" USING btree ("initiated_by");--> statement-breakpoint
CREATE INDEX "cards_account_idx" ON "cards" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "audit_log_user_idx" ON "audit_log" USING btree ("user_id","seq" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_action_idx" ON "audit_log" USING btree ("action","seq" DESC NULLS LAST);