-- Up Migration
-- Availability is a grid of 1-hour slots, so opening hours must fall on whole hours.
ALTER TABLE courts
  ADD CONSTRAINT courts_whole_hours CHECK (
    extract(minute FROM opens_at) = 0 AND extract(second FROM opens_at) = 0
    AND extract(minute FROM closes_at) = 0 AND extract(second FROM closes_at) = 0
  );

-- Down Migration
ALTER TABLE courts DROP CONSTRAINT courts_whole_hours;
