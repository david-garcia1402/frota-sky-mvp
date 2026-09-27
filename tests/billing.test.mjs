import assert from 'node:assert/strict';
import test from 'node:test';
import { applyPayment, assertMercadoPagoConfigured, syncBillingQuantity, verifyMercadoPagoSignature } from '../worker/lib/billing.js';

function createDb(vehicles = 1) {
  const state = {
    vehicles,
    org: {
      id: 'org_1',
      plan: 'trial',
      vehicle_limit: 2,
      billing_status: 'trial',
      billing_quantity: null,
      mp_preapproval_id: null,
    },
    events: [],
  };

  function prepare(sql) {
    const compact = sql.replace(/\s+/g, ' ').trim();
    return {
      bind(...args) {
        return {
          async first() {
            if (compact.startsWith('SELECT COUNT(*)')) return { total: state.vehicles };
            if (compact.includes('FROM organizations')) return { ...state.org };
            if (compact.includes('mp_payment_id = ?') && compact.startsWith('SELECT id, status')) {
              return state.events.find((event) => event.mp_payment_id === args[0]) || null;
            }
            if (compact.includes("status = 'pending'") && compact.includes('plan, quantity')) {
              return [...state.events].reverse().find((event) => event.organization_id === args[0] && event.status === 'pending' && !event.mp_payment_id) || null;
            }
            if (compact.includes("status = 'pending'") && compact.startsWith('SELECT id FROM billing_events')) {
              return [...state.events].reverse().find((event) => event.organization_id === args[0] && event.plan === args[1] && event.status === 'pending' && !event.mp_payment_id) || null;
            }
            return null;
          },
          async run() {
            if (compact.startsWith('UPDATE organizations') && compact.includes('billing_status = \'active\'')) {
              state.org.plan = args[0];
              state.org.vehicle_limit = null;
              state.org.billing_status = 'active';
              state.org.billing_quantity = args[1];
            } else if (compact.startsWith('UPDATE organizations') && compact.includes('mp_preapproval_id = ?')) {
              state.org.mp_preapproval_id = args[0];
              state.org.billing_quantity = args[1];
            } else if (compact.startsWith('UPDATE organizations') && compact.includes('billing_quantity = ?')) {
              state.org.billing_quantity = args[0];
            } else if (compact.startsWith('UPDATE organizations') && compact.includes("billing_status = 'pending'")) {
              state.org.billing_status = 'pending';
            } else if (compact.startsWith('UPDATE billing_events SET mp_payment_id')) {
              const event = state.events.find((item) => item.id === args[6] && !item.mp_payment_id);
              if (event) Object.assign(event, { mp_payment_id: args[0], status: args[1], plan: args[2], amount: args[3], quantity: args[4], payload_json: args[5] });
            } else if (compact.startsWith('UPDATE billing_events SET status')) {
              const event = state.events.find((item) => item.id === args[5]);
              if (event) Object.assign(event, { status: args[0], plan: args[1], amount: args[2], quantity: args[3], payload_json: args[4] });
            } else if (compact.startsWith('INSERT INTO billing_events')) {
              if (state.events.some((event) => event.mp_payment_id && event.mp_payment_id === args[2])) {
                throw new Error('UNIQUE constraint failed: billing_events.mp_payment_id');
              }
              state.events.push({
                id: args[0], organization_id: args[1], mp_payment_id: args[2], plan: args[3], status: args[4], amount: args[5], quantity: args[6], payload_json: args[7],
              });
            }
            return { meta: { changes: 1 } };
          },
        };
      },
    };
  }

  return { DB: { prepare }, state };
}

function payment(overrides = {}) {
  return {
    id: 1001,
    status: 'approved',
    status_detail: 'accredited',
    currency_id: 'BRL',
    transaction_amount: 39.8,
    external_reference: 'org_1',
    payer: { email: 'test_buyer@testuser.com' },
    metadata: { plan: 'management', quantity: '2' },
    ...overrides,
  };
}

function envWith(db, extra = {}) {
  return { DB: db.DB, MP_ACCESS_TOKEN: 'TEST-access-token', MP_SANDBOX: 'true', APP_ORIGIN: 'https://frota-sky.davidsgarcia1402.workers.dev', ...extra };
}

test('sandbox recusa token que não é de teste', () => {
  assert.throws(() => assertMercadoPagoConfigured({ MP_ACCESS_TOKEN: 'APP_USR-live', MP_SANDBOX: 'true' }), (error) => error.code === 'BILLING_SANDBOX');
});

test('pagamento aprovado libera o plano e ignora falha da assinatura', async () => {
  const db = createDb(2);
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, json: async () => ({ message: 'payer_email inválido no sandbox' }) });
  try {
    const result = await applyPayment(envWith(db), payment());
    assert.equal(result.plan, 'management');
    assert.equal(result.billingStatus, 'active');
    assert.equal(result.vehicleLimit, null);
    assert.equal(db.state.org.vehicle_limit, null);
    assert.equal(db.state.events[0].status, 'approved');
    assert.equal(db.state.events[0].mp_payment_id, '1001');
  } finally {
    globalThis.fetch = original;
  }
});

test('o mesmo pagamento aprovado não cobra a liberação duas vezes', async () => {
  const db = createDb(2);
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return { ok: true, json: async () => ({ id: 'pre_1' }) };
  };
  try {
    await applyPayment(envWith(db), payment());
    const again = await applyPayment(envWith(db), payment());
    assert.equal(again.billingStatus, 'active');
    assert.equal(calls, 1);
    assert.equal(db.state.events.length, 1);
  } finally {
    globalThis.fetch = original;
  }
});

test('pagamento recusado ou com valor divergente mantém o teste', async () => {
  const db = createDb(1);
  const rejected = await applyPayment(envWith(db), payment({ id: 1002, status: 'rejected', transaction_amount: 19.9, metadata: { plan: 'essential', quantity: '1' } }));
  assert.equal(rejected.plan, 'trial');
  assert.equal(rejected.billingStatus, 'trial');

  await assert.rejects(
    () => applyPayment(envWith(db), payment({ id: 1003, transaction_amount: 1, metadata: { plan: 'intelligence', quantity: '1' } })),
    (error) => error.code === 'PAYMENT_MISMATCH',
  );
  assert.equal(db.state.org.plan, 'trial');
  assert.equal(db.state.org.vehicle_limit, 2);
});

test('pagamento pendente não libera o terceiro veículo', async () => {
  const db = createDb(2);
  const result = await applyPayment(envWith(db), payment({ id: 1004, status: 'pending', status_detail: 'pending_contingency' }));
  assert.equal(result.billingStatus, 'pending');
  assert.equal(result.plan, 'trial');
  assert.equal(result.vehicleLimit, 2);
});

test('pagamento de outra empresa é recusado', async () => {
  const db = createDb(1);
  await assert.rejects(
    () => applyPayment(envWith(db), payment({ metadata: { plan: 'essential', quantity: '1' }, transaction_amount: 12.9 }), { expectedOrganizationId: 'org_outra' }),
    (error) => error.code === 'PAYMENT_ORG_MISMATCH',
  );
});

test('assinatura acompanha a quantidade de veículos', async () => {
  const db = createDb(3);
  db.state.org.plan = 'management';
  db.state.org.billing_status = 'active';
  db.state.org.vehicle_limit = null;
  db.state.org.mp_preapproval_id = 'pre_1';
  db.state.org.billing_quantity = 2;
  let body = null;
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    body = JSON.parse(options.body);
    return { ok: true, json: async () => ({ id: 'pre_1' }) };
  };
  try {
    await syncBillingQuantity(envWith(db), 'org_1');
    assert.equal(body.auto_recurring.transaction_amount, 59.7);
    assert.equal(db.state.org.billing_quantity, 3);
  } finally {
    globalThis.fetch = original;
  }
});

test('webhook só aceita a assinatura HMAC do Mercado Pago', async () => {
  const secret = 'whsec_test';
  const dataId = '1001';
  const requestId = 'req-1';
  const ts = '1700000000';
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest));
  const v1 = [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  await verifyMercadoPagoSignature(secret, { signature: `ts=${ts},v1=${v1}`, requestId, dataId });
  await assert.rejects(
    () => verifyMercadoPagoSignature(secret, { signature: `ts=${ts},v1=${'0'.repeat(v1.length)}`, requestId, dataId }),
    (error) => error.code === 'INVALID_SIGNATURE',
  );
});
