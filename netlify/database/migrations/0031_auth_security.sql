-- Additive authentication security: external identities, optional TOTP,
-- one-time recovery codes, short-lived MFA challenges and trusted devices.

CREATE TABLE user_identities (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  account_id text NOT NULL,
  user_id text NOT NULL,
  provider text NOT NULL CHECK (provider = 'google'),
  provider_subject text NOT NULL CHECK (provider_subject <> ''),
  email_at_link text NOT NULL CHECK (
    email_at_link = lower(email_at_link)
    AND email_at_link ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  CONSTRAINT user_identities_user_account_fkey FOREIGN KEY (user_id, account_id)
    REFERENCES users (id, account_id) ON DELETE CASCADE,
  UNIQUE (provider, provider_subject),
  UNIQUE (user_id, provider)
);
CREATE INDEX user_identities_account_id_idx ON user_identities (account_id);

CREATE TABLE user_authenticators (
  user_id text PRIMARY KEY,
  account_id text NOT NULL,
  secret_ciphertext text NOT NULL,
  enabled_at timestamptz,
  last_used_step bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_authenticators_user_account_fkey FOREIGN KEY (user_id, account_id)
    REFERENCES users (id, account_id) ON DELETE CASCADE
);
CREATE INDEX user_authenticators_account_id_idx ON user_authenticators (account_id);

CREATE TABLE recovery_codes (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  account_id text NOT NULL,
  user_id text NOT NULL,
  code_hash text NOT NULL CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recovery_codes_user_account_fkey FOREIGN KEY (user_id, account_id)
    REFERENCES users (id, account_id) ON DELETE CASCADE,
  UNIQUE (user_id, code_hash)
);
CREATE INDEX recovery_codes_user_id_idx ON recovery_codes (user_id, created_at);
CREATE INDEX recovery_codes_account_id_idx ON recovery_codes (account_id);

CREATE TABLE auth_challenges (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  account_id text NOT NULL,
  user_id text NOT NULL,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  purpose text NOT NULL CHECK (purpose IN ('login', 'reset')),
  auth_method text NOT NULL CHECK (auth_method IN ('password', 'google')),
  browser_token_hash text CHECK (
    browser_token_hash IS NULL OR browser_token_hash ~ '^[0-9a-f]{64}$'
  ),
  user_agent text NOT NULL DEFAULT '',
  ip text NOT NULL DEFAULT '',
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_challenges_user_account_fkey FOREIGN KEY (user_id, account_id)
    REFERENCES users (id, account_id) ON DELETE CASCADE
);
CREATE INDEX auth_challenges_user_id_idx ON auth_challenges (user_id, created_at);
CREATE INDEX auth_challenges_account_id_idx ON auth_challenges (account_id);

CREATE TABLE auth_devices (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  account_id text NOT NULL,
  user_id text NOT NULL,
  browser_token_hash text NOT NULL CHECK (browser_token_hash ~ '^[0-9a-f]{64}$'),
  user_agent text NOT NULL DEFAULT '',
  last_ip text NOT NULL DEFAULT '',
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  trusted_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_devices_user_account_fkey FOREIGN KEY (user_id, account_id)
    REFERENCES users (id, account_id) ON DELETE CASCADE,
  UNIQUE (user_id, browser_token_hash),
  UNIQUE (id, user_id, account_id)
);
CREATE INDEX auth_devices_account_id_idx ON auth_devices (account_id);

CREATE TABLE mfa_reset_requests (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  account_id text NOT NULL,
  user_id text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'dismissed')),
  resolved_at timestamptz,
  CONSTRAINT mfa_reset_requests_resolution CHECK (
    (status = 'pending' AND resolved_at IS NULL)
    OR (status <> 'pending' AND resolved_at IS NOT NULL)
  ),
  CONSTRAINT mfa_reset_requests_user_account_fkey FOREIGN KEY (user_id, account_id)
    REFERENCES users (id, account_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX mfa_reset_requests_pending_user_key
  ON mfa_reset_requests (user_id) WHERE status = 'pending';
CREATE INDEX mfa_reset_requests_account_id_idx ON mfa_reset_requests (account_id, requested_at);

ALTER TABLE sessions
  ADD COLUMN device_id text;
ALTER TABLE sessions
  ADD CONSTRAINT sessions_device_user_account_fkey
  FOREIGN KEY (device_id, user_id, account_id)
  REFERENCES auth_devices (id, user_id, account_id) ON DELETE CASCADE;
CREATE INDEX sessions_device_id_idx ON sessions (device_id);

REVOKE ALL PRIVILEGES ON TABLE
  user_identities, user_authenticators, recovery_codes, auth_challenges,
  auth_devices, mfa_reset_requests
FROM PUBLIC, reparosm_runtime;

GRANT SELECT (id, account_id, user_id, provider, provider_subject, email_at_link,
              created_at, last_used_at)
  ON user_identities TO reparosm_runtime;
GRANT INSERT (account_id, user_id, provider, provider_subject, email_at_link, last_used_at)
  ON user_identities TO reparosm_runtime;
GRANT UPDATE (last_used_at) ON user_identities TO reparosm_runtime;
GRANT DELETE ON user_identities TO reparosm_runtime;

GRANT SELECT (account_id, user_id, secret_ciphertext, enabled_at, last_used_step,
              created_at, updated_at)
  ON user_authenticators TO reparosm_runtime;
GRANT INSERT (account_id, user_id, secret_ciphertext)
  ON user_authenticators TO reparosm_runtime;
GRANT UPDATE (secret_ciphertext, enabled_at, last_used_step, updated_at)
  ON user_authenticators TO reparosm_runtime;
GRANT DELETE ON user_authenticators TO reparosm_runtime;

GRANT SELECT (id, account_id, user_id, code_hash, used_at, created_at)
  ON recovery_codes TO reparosm_runtime;
GRANT INSERT (account_id, user_id, code_hash) ON recovery_codes TO reparosm_runtime;
GRANT UPDATE (used_at) ON recovery_codes TO reparosm_runtime;
GRANT DELETE ON recovery_codes TO reparosm_runtime;

GRANT SELECT (id, account_id, user_id, token_hash, purpose, auth_method,
              browser_token_hash, user_agent, ip, expires_at, used_at, created_at)
  ON auth_challenges TO reparosm_runtime;
GRANT INSERT (account_id, user_id, token_hash, purpose, auth_method,
              browser_token_hash, user_agent, ip, expires_at)
  ON auth_challenges TO reparosm_runtime;
GRANT UPDATE (used_at) ON auth_challenges TO reparosm_runtime;
GRANT DELETE ON auth_challenges TO reparosm_runtime;

GRANT SELECT (id, account_id, user_id, browser_token_hash, user_agent, last_ip,
              last_seen_at, trusted_until, created_at, updated_at)
  ON auth_devices TO reparosm_runtime;
GRANT INSERT (account_id, user_id, browser_token_hash, user_agent, last_ip)
  ON auth_devices TO reparosm_runtime;
GRANT UPDATE (user_agent, last_ip, last_seen_at, trusted_until, updated_at)
  ON auth_devices TO reparosm_runtime;
GRANT DELETE ON auth_devices TO reparosm_runtime;

GRANT SELECT (id, account_id, user_id, requested_at, status, resolved_at)
  ON mfa_reset_requests TO reparosm_runtime;
GRANT INSERT (account_id, user_id) ON mfa_reset_requests TO reparosm_runtime;
GRANT UPDATE (status, resolved_at) ON mfa_reset_requests TO reparosm_runtime;
GRANT DELETE ON mfa_reset_requests TO reparosm_runtime;

ALTER TABLE user_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_identities FORCE ROW LEVEL SECURITY;
ALTER TABLE user_authenticators ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_authenticators FORCE ROW LEVEL SECURITY;
ALTER TABLE recovery_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_codes FORCE ROW LEVEL SECURITY;
ALTER TABLE auth_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_challenges FORCE ROW LEVEL SECURITY;
ALTER TABLE auth_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_devices FORCE ROW LEVEL SECURITY;
ALTER TABLE mfa_reset_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfa_reset_requests FORCE ROW LEVEL SECURITY;

-- External identity lookup sees only the immutable subject it presented.
CREATE POLICY user_identities_scoped ON user_identities TO reparosm_runtime
  USING (
    (provider = 'google'
     AND provider_subject = NULLIF(current_setting('app.google_subject', true), ''))
    OR user_id = NULLIF(current_setting('app.session_user_id', true), '')
    OR account_id = NULLIF(current_setting('app.account_id', true), '')
    OR user_id IN (
      SELECT u.id FROM users AS u
      WHERE u.username = NULLIF(current_setting('app.auth_username', true), '')
         OR u.email = NULLIF(current_setting('app.auth_email', true), '')
    )
    OR NULLIF(current_setting('app.admin_account_id', true), '') IS NOT NULL
  )
  WITH CHECK (
    user_id = NULLIF(current_setting('app.session_user_id', true), '')
    OR account_id = NULLIF(current_setting('app.account_id', true), '')
    OR user_id IN (
      SELECT u.id FROM users AS u
      WHERE u.username = NULLIF(current_setting('app.auth_username', true), '')
         OR u.email = NULLIF(current_setting('app.auth_email', true), '')
    )
    OR NULLIF(current_setting('app.admin_account_id', true), '') IS NOT NULL
  );

-- A bearer challenge can read and consume only its own row. Once that row is
-- validated, application code derives the tenant context from it.
CREATE POLICY auth_challenges_scoped ON auth_challenges TO reparosm_runtime
  USING (
    token_hash = NULLIF(current_setting('app.auth_challenge_hash', true), '')
    OR user_id = NULLIF(current_setting('app.session_user_id', true), '')
    OR account_id = NULLIF(current_setting('app.account_id', true), '')
    OR user_id IN (
      SELECT u.id FROM users AS u
      WHERE u.username = NULLIF(current_setting('app.auth_username', true), '')
         OR u.email = NULLIF(current_setting('app.auth_email', true), '')
    )
    OR NULLIF(current_setting('app.admin_account_id', true), '') IS NOT NULL
  )
  WITH CHECK (
    token_hash = NULLIF(current_setting('app.auth_challenge_hash', true), '')
    OR user_id = NULLIF(current_setting('app.session_user_id', true), '')
    OR account_id = NULLIF(current_setting('app.account_id', true), '')
    OR user_id IN (
      SELECT u.id FROM users AS u
      WHERE u.username = NULLIF(current_setting('app.auth_username', true), '')
         OR u.email = NULLIF(current_setting('app.auth_email', true), '')
    )
    OR NULLIF(current_setting('app.admin_account_id', true), '') IS NOT NULL
  );

-- Remaining rows are reachable only from the authenticated person, their
-- tenant capability, their primary-login scope or the platform administrator.
DO $$
DECLARE
  secured_table text;
BEGIN
  FOREACH secured_table IN ARRAY ARRAY[
    'user_authenticators', 'recovery_codes', 'auth_devices', 'mfa_reset_requests'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY auth_user_scoped ON %I TO reparosm_runtime
       USING (
         user_id = NULLIF(current_setting(''app.session_user_id'', true), '''')
         OR account_id = NULLIF(current_setting(''app.account_id'', true), '''')
         OR user_id IN (
           SELECT u.id FROM users AS u
           WHERE u.username = NULLIF(current_setting(''app.auth_username'', true), '''')
              OR u.email = NULLIF(current_setting(''app.auth_email'', true), '''')
         )
         OR NULLIF(current_setting(''app.admin_account_id'', true), '''') IS NOT NULL
       )
       WITH CHECK (
         user_id = NULLIF(current_setting(''app.session_user_id'', true), '''')
         OR account_id = NULLIF(current_setting(''app.account_id'', true), '''')
         OR user_id IN (
           SELECT u.id FROM users AS u
           WHERE u.username = NULLIF(current_setting(''app.auth_username'', true), '''')
              OR u.email = NULLIF(current_setting(''app.auth_email'', true), '''')
         )
         OR NULLIF(current_setting(''app.admin_account_id'', true), '''') IS NOT NULL
       )',
      secured_table
    );
  END LOOP;
END
$$;
