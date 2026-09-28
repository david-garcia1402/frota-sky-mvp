ALTER TABLE organizations ADD COLUMN billing_status TEXT;
ALTER TABLE organizations ADD COLUMN billing_subscription_id TEXT;
ALTER TABLE organizations ADD COLUMN billing_email TEXT;

CREATE TABLE IF NOT EXISTS billing_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT,
  provider TEXT NOT NULL DEFAULT 'kiwify',
  event_type TEXT NOT NULL,
  external_id TEXT NOT NULL,
  plan TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(provider, external_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_billing_events_org ON billing_events(organization_id, created_at);
