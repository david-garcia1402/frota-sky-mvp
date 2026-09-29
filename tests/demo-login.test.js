import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getPlatformProxy } from 'wrangler';
import app from '../worker/index.js';
import { hashPassword, verifyPassword } from '../worker/lib/crypto.js';

const DEMO_PASSWORD = 'FrotaSky@2026';
const BROKEN_DEMO_HASH = 'pbkdf2_sha256$100000$RnJvdGFTa3lTZWVkRGVtbzIwMjY=$5fux6hrcITVhQwXQgyOJnMTz9sTOjhdTSv9w8DoNRBU=';
const SEEDED_DEMO_HASH = 'pbkdf2_sha256$100000$RnJvdGFTa3lTZWVkRGVtbzIwMjY=$iPIEywTdj6x7r0adHhpA2VgsEIak58rQf/RbEYoNbUQ=';

async function migrate(db, files) {
  for (const file of files) {
    const sql = readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8');
    const parts = sql.split(/;\s*(?:\r?\n|$)/).map((part) => part.trim()).filter(Boolean);
    for (const part of parts) {
      try {
        await db.prepare(part).run();
      } catch (err) {
        const message = String(err?.message || err);
        if (!/duplicate column|already exists/i.test(message)) throw err;
      }
    }
  }
}

async function call(env, path, { method = 'GET', body, cookie } = {}) {
  const headers = new Headers();
  if (body !== undefined) headers.set('content-type', 'application/json');
  if (cookie) headers.set('cookie', cookie);
  const response = await app.fetch(new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env);
  const text = await response.text();
  let payload = text;
  try { payload = text ? JSON.parse(text) : null; } catch { /* resposta não JSON */ }
  const setCookie = response.headers.get('set-cookie') || '';
  const session = setCookie.match(/frota_session=([^;]+)/)?.[1];
  return { status: response.status, payload, cookie: session ? `frota_session=${session}` : cookie };
}

test('a senha documentada confere com o hash do seed', async () => {
  const script = readFileSync(new URL('../scripts/seed-demo.sh', import.meta.url), 'utf8');
  const hashes = [...script.matchAll(/'(pbkdf2_sha256\$[^']+)'/g)].map((match) => match[1]);
  assert.ok(hashes.length >= 5);
  for (const hash of new Set(hashes)) {
    assert.equal(hash, SEEDED_DEMO_HASH);
    assert.equal(await verifyPassword(DEMO_PASSWORD, hash), true, hash);
  }
  assert.equal(await verifyPassword(DEMO_PASSWORD, BROKEN_DEMO_HASH), false);
});

test('admin demo entra mesmo sem a coluna username e com o hash antigo', async (t) => {
  const platform = await getPlatformProxy({ remoteBindings: false, persist: false });
  t.after(() => platform.dispose());
  const env = platform.env;
  await migrate(env.DB, ['0001_initial.sql']);
  await env.DB.prepare(`INSERT INTO organizations (id, name, plan, vehicle_limit) VALUES ('org_demo', 'Sky Logística', 'intelligence', 50)`).run();
  await env.DB.prepare(`INSERT INTO users (id, name, email, password_hash, status) VALUES ('usr_demo', 'Carlos Eduardo', 'admin@frotasky.demo', ?, 'active')`)
    .bind(BROKEN_DEMO_HASH).run();
  await env.DB.prepare(`INSERT INTO organization_members (id, organization_id, user_id, role) VALUES ('mem_demo', 'org_demo', 'usr_demo', 'owner')`).run();

  const denied = await call(env, '/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@frotasky.demo', password: 'senha-errada' },
  });
  assert.equal(denied.status, 401, JSON.stringify(denied.payload));

  const login = await call(env, '/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@frotasky.demo', password: DEMO_PASSWORD },
  });
  assert.equal(login.status, 200, JSON.stringify(login.payload));
  assert.equal(login.payload.user.email, 'admin@frotasky.demo');
  assert.equal(login.payload.user.role, 'owner');

  const me = await call(env, '/api/auth/me', { cookie: login.cookie });
  assert.equal(me.status, 200, JSON.stringify(me.payload));
  const operators = await call(env, '/api/operators', { cookie: login.cookie });
  assert.equal(operators.status, 200, JSON.stringify(operators.payload));
  assert.deepEqual(operators.payload.items, []);

  const stored = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind('usr_demo').first();
  assert.equal(await verifyPassword(DEMO_PASSWORD, stored.password_hash), true);
  assert.notEqual(stored.password_hash, BROKEN_DEMO_HASH);

  const again = await call(env, '/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@frotasky.demo', password: DEMO_PASSWORD },
  });
  assert.equal(again.status, 200, JSON.stringify(again.payload));
});

test('conta comum entra por e-mail antes da migration de operadores', async (t) => {
  const platform = await getPlatformProxy({ remoteBindings: false, persist: false });
  t.after(() => platform.dispose());
  const env = platform.env;
  await migrate(env.DB, ['0001_initial.sql', '0002_billing.sql']);
  const password = 'senha-conta-123';
  const passwordHash = await hashPassword(password);
  await env.DB.prepare(`INSERT INTO organizations (id, name, plan, vehicle_limit) VALUES ('org_nova', 'Transportes Silva', 'trial', 2)`).run();
  await env.DB.prepare(`INSERT INTO users (id, name, email, password_hash) VALUES ('usr_nova', 'Ana', 'ana@silva.test', ?)`).bind(passwordHash).run();
  await env.DB.prepare(`INSERT INTO organization_members (id, organization_id, user_id, role) VALUES ('mem_nova', 'org_nova', 'usr_nova', 'owner')`).run();

  const login = await call(env, '/api/auth/login', {
    method: 'POST',
    body: { email: 'ana@silva.test', password },
  });
  assert.equal(login.status, 200, JSON.stringify(login.payload));
  assert.equal(login.payload.organization.plan, 'trial');
});
