import { getCookie, HttpError } from './http.js';
import { sha256 } from './crypto.js';

function sessionSql(usernameExpr) {
  return `
    SELECT s.id AS session_id, s.expires_at,
           u.id AS user_id, u.name, u.email, ${usernameExpr} AS username,
           om.organization_id, om.role,
           o.name AS organization_name
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    JOIN organization_members om ON om.user_id = u.id AND om.organization_id = s.organization_id
    JOIN organizations o ON o.id = om.organization_id
    WHERE s.token_hash = ? AND s.expires_at > datetime('now') AND u.status = 'active'
    LIMIT 1
  `;
}

export async function requireAuth(request, env) {
  const token = getCookie(request, 'frota_session');
  if (!token) throw new HttpError(401, 'UNAUTHENTICATED', 'Faça login para continuar.');
  const tokenHash = await sha256(token);
  let row;
  try {
    row = await env.DB.prepare(sessionSql('u.username')).bind(tokenHash).first();
  } catch (cause) {
    if (!String(cause?.message || cause).includes('no such column')) throw cause;
    row = await env.DB.prepare(sessionSql('NULL')).bind(tokenHash).first();
  }
  if (!row) throw new HttpError(401, 'SESSION_EXPIRED', 'Sessão expirada. Entre novamente.');
  return row;
}

export function requireRole(auth, allowed) {
  if (!allowed.includes(auth.role)) {
    throw new HttpError(403, 'FORBIDDEN', 'Você não possui permissão para esta ação.');
  }
}
