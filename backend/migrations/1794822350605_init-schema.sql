
-- Up Migration
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE users (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  name          text NOT NULL,
  role          text NOT NULL CHECK (role IN ('user', 'admin'))
);

CREATE TABLE courts (
  id                 integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name               text NOT NULL,
  sport              text NOT NULL,
  hourly_price_cents integer NOT NULL CHECK (hourly_price_cents > 0),
  opens_at           time NOT NULL,
  closes_at          time NOT NULL,
  is_active          boolean NOT NULL DEFAULT true,
  CHECK (opens_at < closes_at)
);

CREATE TABLE bookings (
  id                integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  court_id          integer NOT NULL REFERENCES courts (id),
  user_id           integer NOT NULL REFERENCES users (id),
  start_at          timestamptz NOT NULL,
  end_at            timestamptz NOT NULL,
  status            text NOT NULL DEFAULT 'confirmed'
                    CHECK (status IN ('confirmed', 'cancelled')),
  total_price_cents integer NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (end_at - start_at IN (interval '1 hour', interval '2 hours')),
  CONSTRAINT bookings_no_overlap EXCLUDE USING gist (
    court_id WITH =,
    tstzrange(start_at, end_at) WITH &&
  ) WHERE (status = 'confirmed')
);

CREATE INDEX bookings_user_id_idx ON bookings (user_id);
CREATE INDEX bookings_start_at_idx ON bookings (start_at);

-- Down Migration
DROP TABLE bookings;
DROP TABLE courts;
DROP TABLE users;
