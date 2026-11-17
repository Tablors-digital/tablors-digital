-- Staff attendance: dedicated table with atomic check-in / check-out guarantees.
-- Run as one transaction. If the final CREATE UNIQUE INDEX fails, a person has more
-- than one open legacy shift: close or correct the extra ones, then re-run.
--
-- Pre-check (optional, run first):
--   SELECT restaurant_id, data->>'staffId' AS staff, count(*)
--   FROM app_documents
--   WHERE collection = 'staff_attendance'
--     AND data->>'checkIn' IS NOT NULL AND data->>'checkOut' IS NULL
--   GROUP BY 1, 2 HAVING count(*) > 1;

BEGIN;

CREATE TABLE IF NOT EXISTS staff_attendance (
  id              text PRIMARY KEY,
  restaurant_id   text NOT NULL,
  staff_id        text NOT NULL,
  work_date       text NOT NULL,
  check_in_at     timestamptz,
  check_out_at    timestamptz,
  worked_minutes  integer,
  corrections     jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE staff_attendance ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS staff_attendance_day_unique
  ON staff_attendance (restaurant_id, staff_id, work_date);

CREATE INDEX IF NOT EXISTS staff_attendance_period_idx
  ON staff_attendance (restaurant_id, work_date);

-- Backfill from the old JSON documents (safe to re-run).
INSERT INTO staff_attendance
  (id, restaurant_id, staff_id, work_date, check_in_at, check_out_at, worked_minutes, corrections)
SELECT
  d.id,
  d.restaurant_id,
  d.data->>'staffId',
  d.data->>'date',
  NULLIF(d.data->>'checkIn', '')::timestamptz,
  NULLIF(d.data->>'checkOut', '')::timestamptz,
  CASE
    WHEN NULLIF(d.data->>'checkOut', '')::timestamptz > NULLIF(d.data->>'checkIn', '')::timestamptz
    THEN round(extract(epoch FROM (
           NULLIF(d.data->>'checkOut', '')::timestamptz
         - NULLIF(d.data->>'checkIn', '')::timestamptz)) / 60)::int
  END,
  COALESCE(d.data->'corrections', '[]'::jsonb)
FROM app_documents d
WHERE d.collection = 'staff_attendance'
ON CONFLICT DO NOTHING;

-- Created AFTER the backfill so legacy data is checked, not silently skipped.
CREATE UNIQUE INDEX IF NOT EXISTS staff_attendance_one_open_unique
  ON staff_attendance (restaurant_id, staff_id)
  WHERE check_in_at IS NOT NULL AND check_out_at IS NULL;

COMMIT;

-- Verify the counts match, then (later, once confident) remove the old documents:
--   SELECT
--     (SELECT count(*) FROM app_documents WHERE collection = 'staff_attendance') AS legacy,
--     (SELECT count(*) FROM staff_attendance) AS migrated;
--   DELETE FROM app_documents WHERE collection = 'staff_attendance';