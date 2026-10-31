-- Session configuration and temporary upload receipts. No credentials or input bytes.
CREATE TABLE deployment_settings (
 session TEXT PRIMARY KEY, url TEXT, template TEXT, revision INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE TABLE deployment_assets (
 id TEXT PRIMARY KEY, session TEXT NOT NULL, url TEXT NOT NULL,
 token TEXT NOT NULL, reference TEXT NOT NULL, expires INTEGER NOT NULL
);
CREATE INDEX deployment_assets_session ON deployment_assets(session, expires);
CREATE TABLE deployment_outputs (
 job TEXT PRIMARY KEY, data TEXT NOT NULL, expires INTEGER NOT NULL
);
CREATE INDEX deployment_outputs_expiry ON deployment_outputs(expires);
