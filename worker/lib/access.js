import { assert, HttpError } from './http.js';

export const OPERATOR_ROLE = 'driver';
export const OPERATOR_EMAIL_DOMAIN = 'operadores.frotasky.invalid';
export const MANAGER_ROLES = ['owner', 'admin', 'manager'];
export const OPERATOR_WRITE_ROLES = ['owner', 'admin', 'manager', 'driver'];

const USERNAME_RE = /^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])$/;

export function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

export function assertUsername(value) {
  const username = normalizeUsername(value);
  assert(
    USERNAME_RE.test(username),
    422,
    'INVALID_USERNAME',
    'O usuário deve ter de 3 a 32 caracteres e usar letras, números, ponto, hífen ou _.',
  );
  return username;
}

export function operatorEmail(username) {
  return `${normalizeUsername(username)}@${OPERATOR_EMAIL_DOMAIN}`;
}

export function publicEmail(email) {
  if (!email || String(email).endsWith(`@${OPERATOR_EMAIL_DOMAIN}`)) return null;
  return email;
}

export function loginIdentifier(body = {}) {
  return String(body.username || body.email || body.login || '').trim().toLowerCase();
}

export function isOperator(auth) {
  return auth?.role === OPERATOR_ROLE;
}

export function forbidOperator(auth) {
  if (isOperator(auth)) {
    throw new HttpError(403, 'FORBIDDEN', 'Você não possui permissão para esta ação.');
  }
}

export async function assignedVehicleIds(env, auth) {
  if (!isOperator(auth)) return null;
  const result = await env.DB.prepare(
    'SELECT vehicle_id FROM operator_vehicles WHERE organization_id = ? AND user_id = ?',
  ).bind(auth.organization_id, auth.user_id).all();
  return result.results.map((row) => row.vehicle_id);
}

export function sqlIn(column, ids) {
  if (!ids.length) return { sql: '0', binds: [] };
  return { sql: `${column} IN (${ids.map(() => '?').join(',')})`, binds: [...ids] };
}

export function andIn(column, ids) {
  if (ids == null) return { sql: '', binds: [] };
  const clause = sqlIn(column, ids);
  return { sql: ` AND ${clause.sql}`, binds: clause.binds };
}

export async function assertVehicleInScope(env, auth, vehicleId) {
  const ids = await assignedVehicleIds(env, auth);
  if (!ids) return ids;
  assert(ids.includes(vehicleId), 404, 'VEHICLE_NOT_FOUND', 'Veículo não encontrado.');
  return ids;
}
