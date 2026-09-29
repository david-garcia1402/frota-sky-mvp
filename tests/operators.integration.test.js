import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getPlatformProxy } from 'wrangler';
import app from '../worker/index.js';

async function migrate(db) {
  for (const file of ['0001_initial.sql', '0002_billing.sql', '0003_operators.sql']) {
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

test('operador entra com usuário e senha e só vê o próprio veículo', async (t) => {
  const platform = await getPlatformProxy({ remoteBindings: false });
  t.after(() => platform.dispose());
  await migrate(platform.env.DB);
  const env = platform.env;
  const stamp = Date.now().toString(36);

  const owner = await call(env, '/api/auth/register', {
    method: 'POST',
    body: { name: 'João Dono', organizationName: `Frota ${stamp}`, email: `joao.${stamp}@frota.test`, password: 'senha-dono-123' },
  });
  assert.equal(owner.status, 201, JSON.stringify(owner.payload));

  const first = await call(env, '/api/vehicles', {
    method: 'POST', cookie: owner.cookie,
    body: { plate: 'ABC1D23', make: 'Scania', model: 'R450', type: 'truck', odometerKm: 1000 },
  });
  const second = await call(env, '/api/vehicles', {
    method: 'POST', cookie: owner.cookie,
    body: { plate: 'DEF2E34', make: 'Volvo', model: 'FH', type: 'truck', odometerKm: 2000 },
  });
  assert.equal(first.status, 201, JSON.stringify(first.payload));
  assert.equal(second.status, 201, JSON.stringify(second.payload));

  const created = await call(env, '/api/operators', {
    method: 'POST', cookie: owner.cookie,
    body: { name: 'Zeca', username: `zeca${stamp}`, password: 'senha-zeca-123', vehicleId: first.payload.id },
  });
  assert.equal(created.status, 201, JSON.stringify(created.payload));
  assert.equal(created.payload.username, `zeca${stamp}`);

  const listed = await call(env, '/api/operators', { cookie: owner.cookie });
  assert.equal(listed.status, 200);
  assert.equal(listed.payload.items[0].username, `zeca${stamp}`);
  assert.equal(listed.payload.items[0].email, null);
  assert.deepEqual(listed.payload.items[0].vehicles.map((vehicle) => vehicle.id), [first.payload.id]);

  const login = await call(env, '/api/auth/login', {
    method: 'POST',
    body: { username: `Zeca${stamp}`, password: 'senha-zeca-123' },
  });
  assert.equal(login.status, 200, JSON.stringify(login.payload));
  assert.equal(login.payload.user.role, 'driver');
  assert.equal(login.payload.user.email, null);
  assert.equal(login.payload.user.vehicles.length, 1);
  assert.equal(login.payload.user.vehicles[0].plate, 'ABC1D23');

  const vehicles = await call(env, '/api/vehicles', { cookie: login.cookie });
  assert.equal(vehicles.status, 200);
  assert.deepEqual(vehicles.payload.items.map((vehicle) => vehicle.plate), ['ABC1D23']);

  const blocked = await call(env, '/api/fuel', {
    method: 'POST', cookie: login.cookie,
    body: { vehicleId: second.payload.id, liters: 10, totalCost: 50, odometerKm: 2100 },
  });
  assert.equal(blocked.status, 404);

  const drivers = await call(env, '/api/drivers', { cookie: login.cookie });
  assert.equal(drivers.status, 403);
  const operators = await call(env, '/api/operators', { cookie: login.cookie });
  assert.equal(operators.status, 403);

  const fuel = await call(env, '/api/fuel', {
    method: 'POST', cookie: login.cookie,
    body: { vehicleId: first.payload.id, liters: 40, totalCost: 240, odometerKm: 1500, station: 'Posto da estrada' },
  });
  assert.equal(fuel.status, 201, JSON.stringify(fuel.payload));

  const maintenance = await call(env, '/api/maintenance', {
    method: 'POST', cookie: login.cookie,
    body: { vehicleId: first.payload.id, description: 'Pneu furou na estrada', cost: 80, odometerKm: 1510 },
  });
  assert.equal(maintenance.status, 201, JSON.stringify(maintenance.payload));

  const odometer = await call(env, `/api/vehicles/${first.payload.id}/odometer`, {
    method: 'POST', cookie: login.cookie, body: { odometerKm: 1520 },
  });
  assert.equal(odometer.status, 200);

  const ownFuel = await call(env, '/api/fuel', { cookie: login.cookie });
  assert.equal(ownFuel.payload.items.length, 1);
  assert.equal(ownFuel.payload.items[0].plate, 'ABC1D23');
  const ownerFuel = await call(env, '/api/fuel', { cookie: owner.cookie });
  assert.equal(ownerFuel.payload.items.length, 1);

  const regression = await call(env, `/api/vehicles/${first.payload.id}/odometer`, {
    method: 'POST', cookie: login.cookie, body: { odometerKm: 10 },
  });
  assert.equal(regression.status, 422);

  const disabled = await call(env, `/api/operators/${created.payload.id}`, {
    method: 'PATCH', cookie: owner.cookie, body: { status: 'disabled' },
  });
  assert.equal(disabled.status, 200);
  const denied = await call(env, '/api/auth/login', {
    method: 'POST',
    body: { username: `zeca${stamp}`, password: 'senha-zeca-123' },
  });
  assert.equal(denied.status, 401);
});
