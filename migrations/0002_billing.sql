ALTER TABLE organizations ADD COLUMN billing_status TEXT NOT NULL DEFAULT 'trial';
ALTER TABLE organizations ADD COLUMN mp_preapproval_id TEXT;
ALTER TABLE organizations ADD COLUMN billing_quantity INTEGER;

CREATE TABLE IF NOT EXISTS billing_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  mp_payment_id TEXT UNIQUE,
  mp_preference_id TEXT,
  plan TEXT,
  status TEXT NOT NULL,
  amount REAL,
  quantity INTEGER,
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_billing_events_org ON billing_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_billing_events_preference ON billing_events(mp_preference_id);
