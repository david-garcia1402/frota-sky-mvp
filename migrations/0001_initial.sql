PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'trial' CHECK(plan IN ('trial','essential','management','intelligence')),
  vehicle_limit INTEGER DEFAULT 2,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS organization_members (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK(role IN ('owner','admin','manager','driver','viewer')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS drivers (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  cpf TEXT,
  cnh_number TEXT,
  cnh_category TEXT,
  cnh_expires_at TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','blocked')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plate TEXT NOT NULL,
  make TEXT,
  model TEXT NOT NULL,
  year INTEGER,
  type TEXT NOT NULL DEFAULT 'other',
  odometer_km REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','maintenance','inactive')),
  primary_driver_id TEXT REFERENCES drivers(id) ON DELETE SET NULL,
  license_expires_at TEXT,
  ipva_expires_at TEXT,
  insurance_expires_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  UNIQUE(organization_id, plate)
);

CREATE TABLE IF NOT EXISTS fuel_entries (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  driver_id TEXT REFERENCES drivers(id) ON DELETE SET NULL,
  liters REAL NOT NULL,
  total_cost REAL NOT NULL,
  price_per_liter REAL,
  odometer_km REAL NOT NULL,
  station TEXT,
  filled_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT,
  phone TEXT,
  email TEXT,
  document TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS maintenance_records (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'corrective' CHECK(type IN ('preventive','corrective')),
  description TEXT NOT NULL,
  cost REAL NOT NULL DEFAULT 0,
  odometer_km REAL,
  performed_at TEXT NOT NULL,
  next_due_date TEXT,
  next_due_km REAL,
  supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('scheduled','in_progress','completed','cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK(severity IN ('low','medium','high')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  due_at TEXT,
  is_read INTEGER NOT NULL DEFAULT 0 CHECK(is_read IN (0,1)),
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  uploaded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);



CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('vehicle','driver','organization')),
  entity_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  number TEXT,
  issued_at TEXT,
  expires_at TEXT,
  file_id TEXT REFERENCES files(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inspections (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  driver_id TEXT REFERENCES drivers(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'pre_trip' CHECK(type IN ('pre_trip','post_trip','periodic','incident')),
  odometer_km REAL,
  status TEXT NOT NULL DEFAULT 'approved' CHECK(status IN ('approved','attention','blocked')),
  notes TEXT,
  checklist_json TEXT,
  inspected_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_documents_org_entity ON documents(organization_id, entity_type, entity_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_inspections_org_vehicle_date ON inspections(organization_id, vehicle_id, inspected_at DESC);

CREATE INDEX IF NOT EXISTS idx_members_user ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_vehicle_org ON vehicles(organization_id, deleted_at, status);
CREATE INDEX IF NOT EXISTS idx_driver_org ON drivers(organization_id, deleted_at, status);
CREATE INDEX IF NOT EXISTS idx_fuel_org_vehicle_date ON fuel_entries(organization_id, vehicle_id, filled_at DESC);
CREATE INDEX IF NOT EXISTS idx_maintenance_org_vehicle_date ON maintenance_records(organization_id, vehicle_id, performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_org_read_due ON alerts(organization_id, is_read, due_at);
CREATE INDEX IF NOT EXISTS idx_files_org_entity ON files(organization_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_org_date ON audit_logs(organization_id, created_at DESC);
