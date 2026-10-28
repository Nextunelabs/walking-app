-- WalkingApp schema. Apply with: npm run db:schema
-- This script is idempotent and does not touch any other database.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS users (
  user_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL,
  password_hash text NOT NULL,
  mobile_number text,
  role text NOT NULL CHECK (role IN ('admin', 'user')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));

CREATE TABLE IF NOT EXISTS challenges (
  challenge_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_name text NOT NULL,
  from_district text NOT NULL,
  to_district text NOT NULL,
  distance_km numeric(10, 3) NOT NULL CHECK (distance_km > 0),
  description text,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'cancelled')),
  suggested_distance_km numeric(10, 3),
  reference_route jsonb,
  created_by uuid REFERENCES users (user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT challenges_dates_chk CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS challenges_status_idx ON challenges (status, start_date, end_date);

ALTER TABLE challenges DROP CONSTRAINT IF EXISTS challenges_created_by_fkey;
ALTER TABLE challenges
  ADD CONSTRAINT challenges_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users (user_id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS challenge_participants (
  participant_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL REFERENCES challenges (challenge_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  total_distance_km numeric(12, 3) NOT NULL DEFAULT 0 CHECK (total_distance_km >= 0),
  progress_percent numeric(6, 2) NOT NULL DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'withdrawn')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT challenge_participants_unique UNIQUE (challenge_id, user_id)
);

CREATE INDEX IF NOT EXISTS challenge_participants_user_idx ON challenge_participants (user_id);

CREATE TABLE IF NOT EXISTS walking_sessions (
  session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
  challenge_id uuid NOT NULL REFERENCES challenges (challenge_id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  last_resumed_at timestamptz,
  duration_seconds integer NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  distance_km numeric(12, 3) NOT NULL DEFAULT 0 CHECK (distance_km >= 0),
  status text NOT NULL CHECK (status IN ('in_progress', 'paused', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS walking_sessions_one_open_idx
  ON walking_sessions (user_id, challenge_id)
  WHERE status IN ('in_progress', 'paused');

CREATE INDEX IF NOT EXISTS walking_sessions_challenge_idx ON walking_sessions (challenge_id, status);
CREATE INDEX IF NOT EXISTS walking_sessions_user_idx ON walking_sessions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS gps_tracking_points (
  tracking_point_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  walking_session_id uuid NOT NULL REFERENCES walking_sessions (session_id) ON DELETE CASCADE,
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  gps_timestamp timestamptz NOT NULL,
  accuracy_m double precision,
  sequence_no integer NOT NULL CHECK (sequence_no > 0),
  client_point_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gps_points_sequence_unique UNIQUE (walking_session_id, sequence_no),
  CONSTRAINT gps_points_client_unique UNIQUE (walking_session_id, client_point_id)
);

CREATE INDEX IF NOT EXISTS gps_points_session_idx
  ON gps_tracking_points (walking_session_id, sequence_no);

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS challenges_set_updated_at ON challenges;
CREATE TRIGGER challenges_set_updated_at
  BEFORE UPDATE ON challenges
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS challenge_participants_set_updated_at ON challenge_participants;
CREATE TRIGGER challenge_participants_set_updated_at
  BEFORE UPDATE ON challenge_participants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS walking_sessions_set_updated_at ON walking_sessions;
CREATE TRIGGER walking_sessions_set_updated_at
  BEFORE UPDATE ON walking_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
