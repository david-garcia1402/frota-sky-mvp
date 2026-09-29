ALTER TABLE users ADD COLUMN username TEXT;
ALTER TABLE drivers ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE UNIQUE INDEX IF NOT EXISTS idx_drivers_user ON drivers(organization_id, user_id) WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS operator_vehicles (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(organization_id, user_id, vehicle_id)
);

CREATE INDEX IF NOT EXISTS idx_operator_vehicles_user ON operator_vehicles(organization_id, user_id);
CREATE INDEX IF NOT EXISTS idx_operator_vehicles_vehicle ON operator_vehicles(organization_id, vehicle_id);
