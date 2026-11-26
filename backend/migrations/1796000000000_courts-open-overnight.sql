-- Up Migration
-- A court may stay open past midnight: closing earlier than opening (20:00–02:00) means
-- it closes the next day, and the same time for both (00:00–00:00) means open around the clock.
ALTER TABLE courts DROP CONSTRAINT courts_check;

-- Down Migration
ALTER TABLE courts ADD CONSTRAINT courts_check CHECK (opens_at < closes_at);
