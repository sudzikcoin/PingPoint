-- Adds device-side capture timestamp on tracking_pings (used for dedup
-- when transistorsoft replays its offline buffer) and a separate table
-- for non-location SDK events (motionchange, providerchange, etc).
ALTER TABLE "tracking_pings"
  ADD COLUMN "recorded_at" timestamp with time zone;

-- Plain UNIQUE index (not partial): PostgreSQL treats NULL recorded_at
-- as distinct, so legacy pings with NULL coexist freely; transistorsoft
-- replays with the same recorded_at hit ON CONFLICT and are dropped.
CREATE UNIQUE INDEX IF NOT EXISTS "tp_driver_recorded_uniq"
  ON "tracking_pings" ("driver_id", "recorded_at");

CREATE TABLE IF NOT EXISTS "tracking_diagnostics" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "truck_token" text NOT NULL,
  "event_type" text NOT NULL,
  "event_data" jsonb,
  "recorded_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "td_token_recorded_idx"
  ON "tracking_diagnostics" ("truck_token", "recorded_at");
