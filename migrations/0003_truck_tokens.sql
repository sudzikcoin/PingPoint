CREATE TABLE IF NOT EXISTS "truck_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "truck_id" uuid NOT NULL,
  "truck_number" text NOT NULL,
  "company_id" uuid NOT NULL,
  "driver_id" uuid,
  "token" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen" timestamp with time zone,
  "fcm_token" text,
  "fcm_token_updated_at" timestamp with time zone,
  CONSTRAINT "truck_tokens_token_unique" UNIQUE("token")
);

DO $$ BEGIN
  ALTER TABLE "truck_tokens" ADD CONSTRAINT "truck_tokens_driver_id_drivers_id_fk"
    FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "truck_tokens_truck_id_unique" ON "truck_tokens" ("truck_id");
CREATE INDEX IF NOT EXISTS "truck_tokens_truck_number_idx" ON "truck_tokens" ("truck_number");
CREATE INDEX IF NOT EXISTS "truck_tokens_token_idx" ON "truck_tokens" ("token");
CREATE INDEX IF NOT EXISTS "truck_tokens_company_idx" ON "truck_tokens" ("company_id");
