-- Accounts, sessions, and cloud timetables.
-- Account tables are lifted from make/bloodbowl unchanged so the copied
-- auth functions work without edits.

CREATE TABLE users (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  username       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash  TEXT NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE auth_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('reset','verify')),
  expires_at INTEGER NOT NULL,
  used_at    INTEGER
);
CREATE INDEX idx_auth_tokens_user ON auth_tokens(user_id, kind);

-- One row per timetable. `data` is the JSON blob described in PLAN.md §5.
-- share_token is NULL until shared; rotating it revokes every old link.
CREATE TABLE timetables (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  share_token TEXT,
  data        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX        idx_tt_owner ON timetables(user_id, updated_at DESC);
CREATE UNIQUE INDEX idx_tt_share ON timetables(share_token);

CREATE TABLE rate_limits (
  key        TEXT PRIMARY KEY,
  count      INTEGER NOT NULL,
  window_end INTEGER NOT NULL
);
