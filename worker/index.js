import { assert, clearSessionCookie, error, HttpError, json, readJson, sessionCookie } from './lib/http.js';
import { hashPassword, randomToken, sha256, verifyPassword } from './lib/crypto.js';
import { requireAuth, requireRole } from './lib/auth.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PLATE_RE = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;
const ID_RE = /^[a-zA-Z0-9_-]{8,64}$/;

function id(prefix) {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
}

function normalizePlate(value = '') {
  return String(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function routeMatch(pathname, pattern) {
  const p = pattern.split('/').filter(Boolean);
  const a = pathname.split('/').filter(Boolean);
  if (p.length !== a.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i += 1) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(a[i]);
    else if (p[i] !== a[i]) return null;
  }
  return params;
}

async function audit(env, auth, action, entityType, entityId, metadata = null) {
  await env.DB.prepare(`INSERT INTO audit_logs
    (id, organization_id, user_id, action, entity_type, entity_id, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(id('aud'), auth.organization_id, auth.user_id, action, entityType, entityId, metadata ? JSON.stringify(metadata) : null)
    .run();
}

async function register(request, env) {
  const body = await readJson(request);
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const organizationName = String(body.organizationName || '').trim();
  assert(name.length >= 2, 422, 'INVALID_NAME', 'Informe seu nome.');
  assert(EMAIL_RE.test(email), 422, 'INVALID_EMAIL', 'Informe um e-mail válido.');
  assert(password.length >= 8, 422, 'WEAK_PASSWORD', 'A senha deve ter pelo menos 8 caracteres.');
  assert(organizationName.length >= 2, 422, 'INVALID_ORGANIZATION', 'Informe o nome da empresa.');

  const exists = await env.DB.prepare('SELECT id FROM users WHERE email = ? LIMIT 1').bind(email).first();
  assert(!exists, 409, 'EMAIL_EXISTS', 'Já existe uma conta com este e-mail.');

  const userId = id('usr');
  const orgId = id('org');
  const memberId = id('mem');
  const passwordHash = await hashPassword(password);
  const batch = [
    env.DB.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)').bind(userId, name, email, passwordHash),
    env.DB.prepare('INSERT INTO organizations (id, name, plan, vehicle_limit) VALUES (?, ?, ?, ?)').bind(orgId, organizationName, 'trial', 2),
    env.DB.prepare('INSERT INTO organization_members (id, organization_id, user_id, role) VALUES (?, ?, ?, ?)').bind(memberId, orgId, userId, 'owner'),
  ];
  await env.DB.batch(batch);

  const token = randomToken();
  const tokenHash = await sha256(token);
  await env.DB.prepare(`INSERT INTO sessions (id, user_id, organization_id, token_hash, expires_at)
    VALUES (?, ?, ?, ?, datetime('now', '+30 days'))`)
    .bind(id('ses'), userId, orgId, tokenHash).run();

  return json({ user: { id: userId, name, email }, organization: { id: orgId, name: organizationName, plan: 'trial', vehicleLimit: 2 } }, 201, {
    'set-cookie': sessionCookie(token),
  });
}

async function login(request, env) {
  const body = await readJson(request);
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const user = await env.DB.prepare('SELECT id, name, email, password_hash, status FROM users WHERE email = ? LIMIT 1').bind(email).first();
  assert(user && user.status === 'active' && await verifyPassword(password, user.password_hash), 401, 'INVALID_CREDENTIALS', 'E-mail ou senha inválidos.');
  const membership = await env.DB.prepare(`SELECT om.organization_id, om.role, o.name AS organization_name, o.plan, o.vehicle_limit
    FROM organization_members om JOIN organizations o ON o.id = om.organization_id
    WHERE om.user_id = ? ORDER BY om.created_at ASC LIMIT 1`).bind(user.id).first();
  assert(membership, 403, 'NO_ORGANIZATION', 'Usuário sem organização vinculada.');

  const token = randomToken();
  const tokenHash = await sha256(token);
  await env.DB.prepare(`INSERT INTO sessions (id, user_id, organization_id, token_hash, expires_at)
    VALUES (?, ?, ?, ?, datetime('now', '+30 days'))`)
    .bind(id('ses'), user.id, membership.organization_id, tokenHash).run();

  return json({
    user: { id: user.id, name: user.name, email: user.email, role: membership.role },
    organization: { id: membership.organization_id, name: membership.organization_name, plan: membership.plan, vehicleLimit: membership.vehicle_limit },
  }, 200, { 'set-cookie': sessionCookie(token) });
}

async function logout(request, env) {
  const token = request.headers.get('cookie')?.match(/(?:^|;\s*)frota_session=([^;]+)/)?.[1];
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(decodeURIComponent(token))).run();
  return json({ ok: true }, 200, { 'set-cookie': clearSessionCookie() });
}

async function me(request, env) {
  const auth = await requireAuth(request, env);
  const org = await env.DB.prepare('SELECT id, name, plan, vehicle_limit FROM organizations WHERE id = ?').bind(auth.organization_id).first();
  return json({
    user: { id: auth.user_id, name: auth.name, email: auth.email, role: auth.role },
    organization: { id: org.id, name: org.name, plan: org.plan, vehicleLimit: org.vehicle_limit },
  });
}

async function dashboard(request, env) {
  const auth = await requireAuth(request, env);
  const [fleet, monthCosts, alerts] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) total,
      SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) active,
      SUM(CASE WHEN status='maintenance' THEN 1 ELSE 0 END) maintenance,
      SUM(CASE WHEN status='inactive' THEN 1 ELSE 0 END) inactive
      FROM vehicles WHERE organization_id = ? AND deleted_at IS NULL`).bind(auth.organization_id).first(),
    env.DB.prepare(`SELECT
      COALESCE((SELECT SUM(total_cost) FROM fuel_entries WHERE organization_id=? AND strftime('%Y-%m', filled_at)=strftime('%Y-%m','now')),0) fuel,
      COALESCE((SELECT SUM(cost) FROM maintenance_records WHERE organization_id=? AND strftime('%Y-%m', performed_at)=strftime('%Y-%m','now')),0) maintenance
    `).bind(auth.organization_id, auth.organization_id).first(),
    env.DB.prepare(`SELECT id, type, severity, title, message, due_at, is_read FROM alerts
      WHERE organization_id = ? AND is_read = 0 ORDER BY severity DESC, due_at ASC LIMIT 8`).bind(auth.organization_id).all(),
  ]);
  return json({ fleet, costs: { fuel: monthCosts.fuel, maintenance: monthCosts.maintenance, total: Number(monthCosts.fuel) + Number(monthCosts.maintenance) }, alerts: alerts.results });
}

async function listVehicles(request, env) {
  const auth = await requireAuth(request, env);
  const url = new URL(request.url);
  const q = `%${(url.searchParams.get('q') || '').trim()}%`;
  const result = await env.DB.prepare(`SELECT v.*, d.name AS driver_name
    FROM vehicles v LEFT JOIN drivers d ON d.id = v.primary_driver_id AND d.organization_id = v.organization_id
    WHERE v.organization_id = ? AND v.deleted_at IS NULL
      AND (? = '%%' OR v.plate LIKE ? OR v.make LIKE ? OR v.model LIKE ? OR d.name LIKE ?)
    ORDER BY v.created_at DESC LIMIT 200`)
    .bind(auth.organization_id, q, q, q, q, q).all();
  return json({ items: result.results });
}

async function createVehicle(request, env) {
  const auth = await requireAuth(request, env);
  requireRole(auth, ['owner', 'admin', 'manager']);
  const body = await readJson(request);
  const plate = normalizePlate(body.plate);
  assert(PLATE_RE.test(plate), 422, 'INVALID_PLATE', 'Informe uma placa brasileira válida.');
  assert(String(body.model || '').trim(), 422, 'INVALID_MODEL', 'Informe o modelo do veículo.');

  const org = await env.DB.prepare('SELECT plan, vehicle_limit FROM organizations WHERE id = ?').bind(auth.organization_id).first();
  const count = await env.DB.prepare('SELECT COUNT(*) AS total FROM vehicles WHERE organization_id = ? AND deleted_at IS NULL').bind(auth.organization_id).first();
  assert(org.vehicle_limit === null || count.total < org.vehicle_limit, 402, 'VEHICLE_LIMIT', 'Limite de veículos do plano atingido.');

  const vehicleId = id('veh');
  try {
    await env.DB.prepare(`INSERT INTO vehicles
      (id, organization_id, plate, make, model, year, type, odometer_km, status, primary_driver_id, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(vehicleId, auth.organization_id, plate, String(body.make || '').trim(), String(body.model).trim(), body.year || null,
        body.type || 'other', Number(body.odometerKm || 0), body.status || 'active', body.primaryDriverId || null, body.notes || null).run();
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw new HttpError(409, 'PLATE_EXISTS', 'Esta placa já está cadastrada.');
    throw e;
  }
  await audit(env, auth, 'vehicle.created', 'vehicle', vehicleId, { plate });
  return json({ id: vehicleId }, 201);
}

async function updateVehicle(request, env, vehicleId) {
  const auth = await requireAuth(request, env);
  requireRole(auth, ['owner', 'admin', 'manager']);
  assert(ID_RE.test(vehicleId), 400, 'INVALID_ID', 'ID inválido.');
  const current = await env.DB.prepare('SELECT * FROM vehicles WHERE id = ? AND organization_id = ? AND deleted_at IS NULL').bind(vehicleId, auth.organization_id).first();
  assert(current, 404, 'NOT_FOUND', 'Veículo não encontrado.');
  const body = await readJson(request);
  const plate = normalizePlate(body.plate ?? current.plate);
  assert(PLATE_RE.test(plate), 422, 'INVALID_PLATE', 'Placa inválida.');
  await env.DB.prepare(`UPDATE vehicles SET plate=?, make=?, model=?, year=?, type=?, odometer_km=?, status=?, primary_driver_id=?, notes=?, updated_at=datetime('now')
    WHERE id=? AND organization_id=?`)
    .bind(plate, body.make ?? current.make, body.model ?? current.model, body.year ?? current.year, body.type ?? current.type,
      body.odometerKm ?? current.odometer_km, body.status ?? current.status, body.primaryDriverId ?? current.primary_driver_id,
      body.notes ?? current.notes, vehicleId, auth.organization_id).run();
  await audit(env, auth, 'vehicle.updated', 'vehicle', vehicleId);
  return json({ ok: true });
}

async function deleteVehicle(request, env, vehicleId) {
  const auth = await requireAuth(request, env);
  requireRole(auth, ['owner', 'admin']);
  const result = await env.DB.prepare(`UPDATE vehicles SET deleted_at=datetime('now'), updated_at=datetime('now')
    WHERE id=? AND organization_id=? AND deleted_at IS NULL`).bind(vehicleId, auth.organization_id).run();
  assert(result.meta.changes > 0, 404, 'NOT_FOUND', 'Veículo não encontrado.');
  await audit(env, auth, 'vehicle.deleted', 'vehicle', vehicleId);
  return json({ ok: true });
}

async function listDrivers(request, env) {
  const auth = await requireAuth(request, env);
  const result = await env.DB.prepare(`SELECT * FROM drivers WHERE organization_id=? AND deleted_at IS NULL ORDER BY name`).bind(auth.organization_id).all();
  return json({ items: result.results });
}

async function createDriver(request, env) {
  const auth = await requireAuth(request, env);
  requireRole(auth, ['owner', 'admin', 'manager']);
  const body = await readJson(request);
  assert(String(body.name || '').trim().length >= 2, 422, 'INVALID_NAME', 'Informe o nome do motorista.');
  const driverId = id('drv');
  await env.DB.prepare(`INSERT INTO drivers
    (id, organization_id, name, phone, cpf, cnh_number, cnh_category, cnh_expires_at, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(driverId, auth.organization_id, String(body.name).trim(), body.phone || null, body.cpf || null, body.cnhNumber || null,
      body.cnhCategory || null, body.cnhExpiresAt || null, body.status || 'active').run();
  await audit(env, auth, 'driver.created', 'driver', driverId);
  return json({ id: driverId }, 201);
}

async function createFuel(request, env) {
  const auth = await requireAuth(request, env);
  const body = await readJson(request);
  assert(Number(body.liters) > 0 && Number(body.totalCost) >= 0 && Number(body.odometerKm) >= 0, 422, 'INVALID_FUEL_ENTRY', 'Dados de abastecimento inválidos.');
  const vehicle = await env.DB.prepare('SELECT id, odometer_km FROM vehicles WHERE id=? AND organization_id=? AND deleted_at IS NULL').bind(body.vehicleId, auth.organization_id).first();
  assert(vehicle, 404, 'VEHICLE_NOT_FOUND', 'Veículo não encontrado.');
  const fuelId = id('fuel');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO fuel_entries
      (id, organization_id, vehicle_id, driver_id, liters, total_cost, price_per_liter, odometer_km, station, filled_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(fuelId, auth.organization_id, body.vehicleId, body.driverId || null, Number(body.liters), Number(body.totalCost),
        body.pricePerLiter || Number(body.totalCost) / Number(body.liters), Number(body.odometerKm), body.station || null, body.filledAt || new Date().toISOString()),
    env.DB.prepare(`UPDATE vehicles SET odometer_km = CASE WHEN odometer_km < ? THEN ? ELSE odometer_km END, updated_at=datetime('now') WHERE id=? AND organization_id=?`)
      .bind(Number(body.odometerKm), Number(body.odometerKm), body.vehicleId, auth.organization_id),
  ]);
  await audit(env, auth, 'fuel.created', 'fuel_entry', fuelId);
  return json({ id: fuelId }, 201);
}

async function listFuel(request, env) {
  const auth = await requireAuth(request, env);
  const url = new URL(request.url);
  const vehicleId = url.searchParams.get('vehicleId');
  const result = vehicleId
    ? await env.DB.prepare(`SELECT * FROM fuel_entries WHERE organization_id=? AND vehicle_id=? ORDER BY filled_at DESC LIMIT 200`).bind(auth.organization_id, vehicleId).all()
    : await env.DB.prepare(`SELECT * FROM fuel_entries WHERE organization_id=? ORDER BY filled_at DESC LIMIT 200`).bind(auth.organization_id).all();
  return json({ items: result.results });
}

async function createMaintenance(request, env) {
  const auth = await requireAuth(request, env);
  requireRole(auth, ['owner', 'admin', 'manager']);
  const body = await readJson(request);
  const vehicle = await env.DB.prepare('SELECT id FROM vehicles WHERE id=? AND organization_id=? AND deleted_at IS NULL').bind(body.vehicleId, auth.organization_id).first();
  assert(vehicle, 404, 'VEHICLE_NOT_FOUND', 'Veículo não encontrado.');
  assert(String(body.description || '').trim(), 422, 'INVALID_DESCRIPTION', 'Informe a manutenção realizada.');
  const maintenanceId = id('mnt');
  await env.DB.prepare(`INSERT INTO maintenance_records
    (id, organization_id, vehicle_id, type, description, cost, odometer_km, performed_at, next_due_date, next_due_km, supplier_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(maintenanceId, auth.organization_id, body.vehicleId, body.type || 'corrective', String(body.description).trim(), Number(body.cost || 0),
      body.odometerKm || null, body.performedAt || new Date().toISOString(), body.nextDueDate || null, body.nextDueKm || null, body.supplierId || null, body.status || 'completed').run();
  await audit(env, auth, 'maintenance.created', 'maintenance', maintenanceId);
  return json({ id: maintenanceId }, 201);
}

async function listMaintenance(request, env) {
  const auth = await requireAuth(request, env);
  const result = await env.DB.prepare(`SELECT m.*, v.plate, v.make, v.model FROM maintenance_records m
    JOIN vehicles v ON v.id=m.vehicle_id AND v.organization_id=m.organization_id
    WHERE m.organization_id=? ORDER BY m.performed_at DESC LIMIT 200`).bind(auth.organization_id).all();
  return json({ items: result.results });
}

async function listAlerts(request, env) {
  const auth = await requireAuth(request, env);
  const result = await env.DB.prepare(`SELECT * FROM alerts WHERE organization_id=? ORDER BY is_read ASC, severity DESC, due_at ASC LIMIT 200`).bind(auth.organization_id).all();
  return json({ items: result.results });
}

async function markAlertRead(request, env, alertId) {
  const auth = await requireAuth(request, env);
  await env.DB.prepare(`UPDATE alerts SET is_read=1, read_at=datetime('now') WHERE id=? AND organization_id=?`).bind(alertId, auth.organization_id).run();
  return json({ ok: true });
}


async function listSuppliers(request, env) {
  const auth = await requireAuth(request, env);
  const result = await env.DB.prepare(`SELECT * FROM suppliers WHERE organization_id=? ORDER BY name`).bind(auth.organization_id).all();
  return json({ items: result.results });
}

async function createSupplier(request, env) {
  const auth = await requireAuth(request, env);
  requireRole(auth, ['owner', 'admin', 'manager']);
  const body = await readJson(request);
  const name = String(body.name || '').trim();
  assert(name.length >= 2, 422, 'INVALID_NAME', 'Informe o nome do fornecedor.');
  const supplierId = id('sup');
  await env.DB.prepare(`INSERT INTO suppliers (id, organization_id, name, category, phone, email, document)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(supplierId, auth.organization_id, name, body.category || null, body.phone || null, body.email || null, body.document || null).run();
  await audit(env, auth, 'supplier.created', 'supplier', supplierId);
  return json({ id: supplierId }, 201);
}

async function listDocuments(request, env) {
  const auth = await requireAuth(request, env);
  const url = new URL(request.url);
  const entityType = url.searchParams.get('entityType');
  const entityId = url.searchParams.get('entityId');
  assert(entityType && entityId, 422, 'MISSING_FILTERS', 'Informe entityType e entityId.');
  const result = await env.DB.prepare(`SELECT d.*, f.mime_type, f.size_bytes
    FROM documents d LEFT JOIN files f ON f.id=d.file_id AND f.organization_id=d.organization_id
    WHERE d.organization_id=? AND d.entity_type=? AND d.entity_id=? ORDER BY d.expires_at ASC, d.created_at DESC`)
    .bind(auth.organization_id, entityType, entityId).all();
  return json({ items: result.results });
}

async function createDocument(request, env) {
  const auth = await requireAuth(request, env);
  requireRole(auth, ['owner', 'admin', 'manager']);
  const body = await readJson(request);
  assert(['vehicle','driver','organization'].includes(body.entityType), 422, 'INVALID_ENTITY', 'Entidade de documento inválida.');
  assert(String(body.entityId || '').length >= 8, 422, 'INVALID_ENTITY_ID', 'ID da entidade inválido.');
  assert(String(body.kind || '').trim().length >= 2, 422, 'INVALID_KIND', 'Informe o tipo de documento.');
  const documentId = id('doc');
  await env.DB.prepare(`INSERT INTO documents
    (id, organization_id, entity_type, entity_id, kind, number, issued_at, expires_at, file_id, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(documentId, auth.organization_id, body.entityType, body.entityId, String(body.kind).trim(), body.number || null,
      body.issuedAt || null, body.expiresAt || null, body.fileId || null, body.notes || null).run();
  await audit(env, auth, 'document.created', 'document', documentId);
  return json({ id: documentId }, 201);
}

async function listInspections(request, env) {
  const auth = await requireAuth(request, env);
  const result = await env.DB.prepare(`SELECT i.*, v.plate, v.make, v.model, d.name AS driver_name
    FROM inspections i
    JOIN vehicles v ON v.id=i.vehicle_id AND v.organization_id=i.organization_id
    LEFT JOIN drivers d ON d.id=i.driver_id AND d.organization_id=i.organization_id
    WHERE i.organization_id=? ORDER BY i.inspected_at DESC LIMIT 200`).bind(auth.organization_id).all();
  return json({ items: result.results.map(row => ({ ...row, checklist: row.checklist_json ? JSON.parse(row.checklist_json) : null })) });
}

async function createInspection(request, env) {
  const auth = await requireAuth(request, env);
  const body = await readJson(request);
  const vehicle = await env.DB.prepare('SELECT id FROM vehicles WHERE id=? AND organization_id=? AND deleted_at IS NULL')
    .bind(body.vehicleId, auth.organization_id).first();
  assert(vehicle, 404, 'VEHICLE_NOT_FOUND', 'Veículo não encontrado.');
  const inspectionId = id('ins');
  await env.DB.prepare(`INSERT INTO inspections
    (id, organization_id, vehicle_id, driver_id, type, odometer_km, status, notes, checklist_json, inspected_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(inspectionId, auth.organization_id, body.vehicleId, body.driverId || null, body.type || 'pre_trip',
      body.odometerKm || null, body.status || 'approved', body.notes || null,
      body.checklist ? JSON.stringify(body.checklist) : null, body.inspectedAt || new Date().toISOString()).run();
  await audit(env, auth, 'inspection.created', 'inspection', inspectionId);
  return json({ id: inspectionId }, 201);
}

async function upload(request, env, kind, entityId) {
  const auth = await requireAuth(request, env);
  assert(['inspection', 'driver-document', 'vehicle-document'].includes(kind), 400, 'INVALID_UPLOAD_KIND', 'Tipo de upload inválido.');
  const contentType = request.headers.get('content-type') || 'application/octet-stream';
  const length = Number(request.headers.get('content-length') || 0);
  assert(length === 0 || length <= 8 * 1024 * 1024, 413, 'FILE_TOO_LARGE', 'Arquivo maior que 8 MB.');
  const extByType = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
  const ext = extByType[contentType];
  assert(ext, 415, 'UNSUPPORTED_FILE', 'Use JPG, PNG, WEBP ou PDF.');
  const key = `${auth.organization_id}/${kind}/${entityId}/${crypto.randomUUID()}.${ext}`;
  const body = await request.arrayBuffer();
  assert(body.byteLength > 0 && body.byteLength <= 8 * 1024 * 1024, 413, 'FILE_TOO_LARGE', 'Arquivo inválido ou maior que 8 MB.');
  await env.FILES.put(key, body, { httpMetadata: { contentType } });
  const fileId = id('fil');
  await env.DB.prepare(`INSERT INTO files (id, organization_id, entity_type, entity_id, r2_key, mime_type, size_bytes, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(fileId, auth.organization_id, kind, entityId, key, contentType, body.byteLength, auth.user_id).run();
  await audit(env, auth, 'file.uploaded', kind, entityId, { fileId });
  return json({ id: fileId, key }, 201);
}

async function getFile(request, env, fileId) {
  const auth = await requireAuth(request, env);
  const file = await env.DB.prepare('SELECT * FROM files WHERE id=? AND organization_id=?').bind(fileId, auth.organization_id).first();
  assert(file, 404, 'NOT_FOUND', 'Arquivo não encontrado.');
  const object = await env.FILES.get(file.r2_key);
  assert(object, 404, 'OBJECT_NOT_FOUND', 'Arquivo não encontrado no storage.');
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('cache-control', 'private, max-age=300');
  return new Response(object.body, { headers });
}

async function generateAlerts(env) {
  await env.DB.prepare(`DELETE FROM alerts WHERE type IN ('cnh_expiry','license_expiry','insurance_expiry','maintenance_due') AND is_read=0`).run();
  await env.DB.prepare(`INSERT INTO alerts (id, organization_id, type, severity, title, message, entity_type, entity_id, due_at)
    SELECT 'alt_' || lower(hex(randomblob(16))), organization_id, 'cnh_expiry',
      CASE WHEN julianday(cnh_expires_at)-julianday('now') <= 7 THEN 'high' ELSE 'medium' END,
      'CNH próxima do vencimento', name || ' vence em breve.', 'driver', id, cnh_expires_at
    FROM drivers WHERE deleted_at IS NULL AND status='active' AND cnh_expires_at IS NOT NULL
      AND date(cnh_expires_at) BETWEEN date('now') AND date('now','+30 days')`).run();
  await env.DB.prepare(`INSERT INTO alerts (id, organization_id, type, severity, title, message, entity_type, entity_id, due_at)
    SELECT 'alt_' || lower(hex(randomblob(16))), organization_id, 'maintenance_due', 'high',
      'Manutenção por quilometragem próxima', plate || ' atingiu a faixa da próxima manutenção.', 'vehicle', v.id, datetime('now')
    FROM vehicles v WHERE deleted_at IS NULL AND EXISTS (
      SELECT 1 FROM maintenance_records m WHERE m.vehicle_id=v.id AND m.organization_id=v.organization_id
      AND m.next_due_km IS NOT NULL AND m.next_due_km <= v.odometer_km + 1000
    )`).run();
}

async function api(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  if (path === '/api/health') return json({ ok: true, service: 'frota-sky-api', time: new Date().toISOString() });
  if (path === '/api/auth/register' && method === 'POST') return register(request, env);
  if (path === '/api/auth/login' && method === 'POST') return login(request, env);
  if (path === '/api/auth/logout' && method === 'POST') return logout(request, env);
  if (path === '/api/auth/me' && method === 'GET') return me(request, env);
  if (path === '/api/dashboard' && method === 'GET') return dashboard(request, env);
  if (path === '/api/vehicles' && method === 'GET') return listVehicles(request, env);
  if (path === '/api/vehicles' && method === 'POST') return createVehicle(request, env);
  if (path === '/api/drivers' && method === 'GET') return listDrivers(request, env);
  if (path === '/api/drivers' && method === 'POST') return createDriver(request, env);
  if (path === '/api/fuel' && method === 'GET') return listFuel(request, env);
  if (path === '/api/fuel' && method === 'POST') return createFuel(request, env);
  if (path === '/api/maintenance' && method === 'GET') return listMaintenance(request, env);
  if (path === '/api/maintenance' && method === 'POST') return createMaintenance(request, env);
  if (path === '/api/alerts' && method === 'GET') return listAlerts(request, env);
  if (path === '/api/suppliers' && method === 'GET') return listSuppliers(request, env);
  if (path === '/api/suppliers' && method === 'POST') return createSupplier(request, env);
  if (path === '/api/documents' && method === 'GET') return listDocuments(request, env);
  if (path === '/api/documents' && method === 'POST') return createDocument(request, env);
  if (path === '/api/inspections' && method === 'GET') return listInspections(request, env);
  if (path === '/api/inspections' && method === 'POST') return createInspection(request, env);

  let params = routeMatch(path, '/api/vehicles/:id');
  if (params && method === 'PATCH') return updateVehicle(request, env, params.id);
  if (params && method === 'DELETE') return deleteVehicle(request, env, params.id);
  params = routeMatch(path, '/api/alerts/:id/read');
  if (params && method === 'POST') return markAlertRead(request, env, params.id);
  params = routeMatch(path, '/api/uploads/:kind/:entityId');
  if (params && method === 'PUT') return upload(request, env, params.kind, params.entityId);
  params = routeMatch(path, '/api/files/:id');
  if (params && method === 'GET') return getFile(request, env, params.id);

  return error('Rota não encontrada.', 404, 'NOT_FOUND');
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith('/api/')) return await api(request, env);
      if (env.ASSETS) return env.ASSETS.fetch(request);
      return error('Frontend não configurado.', 404, 'ASSETS_NOT_CONFIGURED');
    } catch (err) {
      if (err instanceof HttpError) return error(err.message, err.status, err.code);
      console.error(err);
      return error('Erro interno inesperado.', 500, 'INTERNAL_ERROR');
    }
  },
  async scheduled(_controller, env) {
    await generateAlerts(env);
    await env.DB.prepare(`DELETE FROM sessions WHERE expires_at <= datetime('now')`).run();
  },
};
