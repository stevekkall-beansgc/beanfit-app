-- 0002: federated identities. One user may hold several (google today,
-- microsoft/github/etc later). Email remains the account-linking key.
CREATE TABLE IF NOT EXISTS user_identities (
  provider TEXT NOT NULL,
  provider_uid TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  email_at_link TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (provider, provider_uid)
);
CREATE INDEX IF NOT EXISTS idx_identities_user ON user_identities(user_id);
