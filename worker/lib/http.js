export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

export function error(message, status = 400, code = 'BAD_REQUEST') {
  return json({ error: { code, message } }, status);
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'Corpo JSON inválido.');
  }
}

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function assert(condition, status, code, message) {
  if (!condition) throw new HttpError(status, code, message);
}

export function getCookie(request, name) {
  const cookie = request.headers.get('cookie') || '';
  for (const part of cookie.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function sessionCookie(token, maxAge = 60 * 60 * 24 * 30) {
  return `frota_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearSessionCookie() {
  return 'frota_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
}
