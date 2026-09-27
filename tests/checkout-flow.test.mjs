import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import worker from '../worker/index.js';

const origin = 'https://frota-sky.davidsgarcia1402.workers.dev';

function responseJson(data, ok = true) {
  return { ok, status: ok ? 200 : 400, json: async () => data };
}

function createD1() {
  const db = new DatabaseSync(':memory:');
  const migration = ['0001_initial.sql', '0002_billing.sql']
    .map((name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'))
    .join('\n');
  db.exec(migration);
  return {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              return db.prepare(sql).get(...args) ?? null;
            },
            async all() {
              return { results: db.prepare(sql).all(...args) };
            },
            async run() {
              const info = db.prepare(sql).run(...args);
              return { meta: { changes: Number(info.changes) } };
            },
          };
        },
      };
    },
    async batch(statements) {
      db.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        db.exec('COMMIT');
        return results;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

async function sign(secret, dataId, requestId, ts) {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest));
  const v1 = [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `ts=${ts},v1=${v1}`;
}

test('compra aprovada libera o plano e o terceiro veículo', async () => {
  const secret = 'whsec_test';
  const env = {
    DB: createD1(),
    MP_ACCESS_TOKEN: 'TEST-local-simulation',
    MP_SANDBOX: 'true',
    MP_WEBHOOK_SECRET: secret,
    APP_ORIGIN: origin,
  };
  let orgId = '';
  const preapprovalBodies = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.endsWith('/checkout/preferences')) {
      const body = JSON.parse(options.body);
      assert.equal(body.items[0].unit_price, 19.9);
      assert.equal(body.items[0].quantity, 2);
      assert.equal(body.external_reference, orgId);
      return responseJson({
        id: 'pref_1',
        sandbox_init_point: 'https://sandbox.mercadopago.com.br/checkout/v1/redirect?pref_id=pref_1',
        init_point: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=pref_1',
      });
    }
    if (href.endsWith('/v1/payments/1001')) {
      return responseJson({
        id: 1001,
        status: 'approved',
        status_detail: 'accredited',
        currency_id: 'BRL',
        transaction_amount: 39.8,
        external_reference: orgId,
        payer: { email: 'buyer@testuser.com' },
        metadata: { plan: 'management', quantity: '2' },
      });
    }
    if (href.includes('/preapproval')) {
      preapprovalBodies.push(options.body ? JSON.parse(options.body) : null);
      return responseJson({ id: 'pre_1' });
    }
    return responseJson({ message: 'não encontrado' }, false);
  };

  async function call(path, { method = 'GET', body, cookie, headers = {} } = {}) {
    const requestHeaders = new Headers(headers);
    if (body) requestHeaders.set('content-type', 'application/json');
    if (cookie) requestHeaders.set('cookie', cookie);
    const response = await worker.fetch(new Request(`${origin}${path}`, {
      method,
      headers: requestHeaders,
      body: body ? JSON.stringify(body) : undefined,
    }), env);
    const data = await response.json();
    return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie };
  }

  try {
    const anon = await call('/api/billing/checkout', { method: 'POST', body: { plan: 'management' } });
    assert.equal(anon.status, 401);

    const registered = await call('/api/auth/register', {
      method: 'POST',
      body: { name: 'Dona da Frota', organizationName: 'Transportes Teste', email: 'owner@frota.test', password: 'senha-segura' },
    });
    assert.equal(registered.status, 201, JSON.stringify(registered.data));
    assert.equal(registered.data.organization.plan, 'trial');
    assert.equal(registered.data.user.role, 'owner');
    orgId = registered.data.organization.id;
    let cookie = registered.cookie;

    for (const plate of ['ABC1D23', 'DEF2E34']) {
      const created = await call('/api/vehicles', {
        method: 'POST', cookie, body: { plate, model: 'Sprinter', odometerKm: 10 },
      });
      assert.equal(created.status, 201, JSON.stringify(created.data));
    }
    const blocked = await call('/api/vehicles', {
      method: 'POST', cookie, body: { plate: 'GHI3F45', model: 'Sprinter', odometerKm: 10 },
    });
    assert.equal(blocked.status, 402);
    assert.equal(blocked.data.error.code, 'VEHICLE_LIMIT');

    const checkout = await call('/api/billing/checkout', { method: 'POST', cookie, body: { plan: 'management' } });
    assert.equal(checkout.status, 200, JSON.stringify(checkout.data));
    assert.equal(checkout.data.url.includes('sandbox.mercadopago.com.br'), true);
    assert.equal(checkout.data.amount, 39.8);

    const confirmed = await call('/api/billing/confirm', { method: 'POST', cookie, body: { paymentId: '1001' } });
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.data));
    assert.equal(confirmed.data.billingStatus, 'active');
    assert.equal(confirmed.data.plan, 'management');
    assert.equal(confirmed.data.vehicleLimit, null);

    const me = await call('/api/auth/me', { cookie });
    assert.equal(me.data.organization.plan, 'management');
    assert.equal(me.data.organization.vehicleLimit, null);
    assert.equal(me.data.organization.billingStatus, 'active');

    const third = await call('/api/vehicles', {
      method: 'POST', cookie, body: { plate: 'GHI3F45', model: 'Sprinter', odometerKm: 12 },
    });
    assert.equal(third.status, 201, JSON.stringify(third.data));
    assert.equal(preapprovalBodies.at(-1).auto_recurring.transaction_amount, 59.7);

    const webhook = await call('/api/billing/webhook?data.id=1001&type=payment', {
      method: 'POST',
      headers: {
        'x-signature': await sign(secret, '1001', 'req-1', '1700000000'),
        'x-request-id': 'req-1',
      },
      body: { type: 'payment', data: { id: '1001' } },
    });
    assert.equal(webhook.status, 200, JSON.stringify(webhook.data));
    assert.equal(webhook.data.billingStatus, 'active');

    const forged = await call('/api/billing/webhook?data.id=1001&type=payment', {
      method: 'POST',
      headers: { 'x-signature': 'ts=1700000000,v1=0000000000000000000000000000000000000000000000000000000000000000', 'x-request-id': 'req-1' },
      body: { type: 'payment', data: { id: '1001' } },
    });
    assert.equal(forged.status, 401);

    await env.DB.prepare(`UPDATE organization_members SET role = 'manager' WHERE organization_id = ?`).bind(orgId).run();
    const forbidden = await call('/api/billing/checkout', { method: 'POST', cookie, body: { plan: 'essential' } });
    assert.equal(forbidden.status, 403);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
