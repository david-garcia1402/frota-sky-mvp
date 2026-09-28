import assert from 'node:assert/strict';
import test from 'node:test';
import { checkoutUrl, PLANS } from '../shared/plans.js';
import { applyKiwifyWebhook, interpretKiwifyEvent, isKiwifyAuthorized, kiwifySignatureMatches, resolvePlanId } from '../worker/lib/kiwify.js';

test('checkout de cada plano aponta para o link da Kiwify e identifica a empresa', () => {
  const essencial = checkoutUrl(PLANS[0], { email: 'ana@frota.com', name: 'Ana', organizationId: 'org_abc' });
  const gestao = checkoutUrl(PLANS[1], { organizationId: 'org_abc' });
  const inteligencia = checkoutUrl(PLANS[2], {});
  assert.equal(new URL(essencial).origin + new URL(essencial).pathname, 'https://pay.kiwify.com.br/9DUQjYR');
  assert.equal(new URL(gestao).origin + new URL(gestao).pathname, 'https://pay.kiwify.com.br/vUnXhqQ');
  assert.equal(new URL(inteligencia).origin + new URL(inteligencia).pathname, 'https://pay.kiwify.com.br/Hrk6kF9');
  assert.equal(new URL(essencial).searchParams.get('email'), 'ana@frota.com');
  assert.equal(new URL(essencial).searchParams.get('src'), 'org_abc');
  assert.equal(new URL(essencial).searchParams.get('utm_campaign'), 'essential');
});

test('reconhece o plano pelo nome do produto da Kiwify', () => {
  assert.equal(resolvePlanId('', 'Essencial'), 'essential');
  assert.equal(resolvePlanId('', 'Gestão'), 'management');
  assert.equal(resolvePlanId('', 'Inteligência'), 'intelligence');
  assert.equal(resolvePlanId('prod_g', 'Outro', { KIWIFY_PRODUCT_MANAGEMENT: 'prod_g' }), 'management');
  assert.equal(resolvePlanId('', 'Página de vendas'), null);
});

test('compra aprovada ativa o plano e reembolso devolve o teste', async () => {
  const db = memoryDb();
  const approved = {
    webhook_event_type: 'order_approved',
    order_id: 'ord_1',
    subscription_id: 'sub_1',
    Product: { product_name: 'Gestão' },
    Customer: { email: 'ana@frota.com' },
    TrackingParameters: { src: 'org_1' },
  };
  assert.equal(interpretKiwifyEvent(approved).planId, 'management');
  const activated = await applyKiwifyWebhook({ DB: db }, approved);
  assert.deepEqual(activated, { applied: true, organizationId: 'org_1', plan: 'management' });
  assert.equal(db.orgs.get('org_1').plan, 'management');
  assert.equal(db.orgs.get('org_1').vehicle_limit, null);

  const again = await applyKiwifyWebhook({ DB: db }, approved);
  assert.equal(again.duplicate, true);

  const refunded = await applyKiwifyWebhook({ DB: db }, {
    webhook_event_type: 'order_refunded',
    order_id: 'ord_1',
    subscription_id: 'sub_1',
    Product: { product_name: 'Gestão' },
    TrackingParameters: { src: 'org_1' },
  });
  assert.equal(refunded.plan, 'trial');
  assert.equal(db.orgs.get('org_1').vehicle_limit, 2);
  assert.equal(db.orgs.get('org_1').billing_status, 'canceled');
});

test('cancelamento de outra assinatura não rebaixa o plano atual', async () => {
  const db = memoryDb();
  db.orgs.set('org_1', { id: 'org_1', plan: 'intelligence', vehicle_limit: null, billing_status: 'active', billing_subscription_id: 'sub_new', billing_email: null });
  const result = await applyKiwifyWebhook({ DB: db }, {
    webhook_event_type: 'subscription_canceled',
    subscription_id: 'sub_old',
    TrackingParameters: { src: 'org_1' },
  });
  assert.equal(result.reason, 'subscription_mismatch');
  assert.equal(db.orgs.get('org_1').plan, 'intelligence');
});

test('webhook sem token é recusado e a assinatura HMAC é aceita', async () => {
  const body = '{"ok":true}';
  const request = new Request('https://frota-sky.example/api/webhooks/kiwify');
  assert.equal(await isKiwifyAuthorized(request, body, ''), false);
  assert.equal(await isKiwifyAuthorized(new Request('https://frota-sky.example/api/webhooks/kiwify?token=segredo'), body, 'segredo'), true);
  assert.equal(await isKiwifyAuthorized(new Request('https://frota-sky.example/api/webhooks/kiwify?token=errado'), body, 'segredo'), false);

  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('segredo'), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const hex = [...new Uint8Array(signed)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  assert.equal(await kiwifySignatureMatches(body, hex, 'segredo'), true);
  const signedRequest = new Request('https://frota-sky.example/api/webhooks/kiwify', { headers: { signature: hex } });
  assert.equal(await isKiwifyAuthorized(signedRequest, body, 'segredo'), true);
});

function memoryDb() {
  const orgs = new Map([['org_1', {
    id: 'org_1', plan: 'trial', vehicle_limit: 2, billing_status: null, billing_subscription_id: null, billing_email: null,
  }]]);
  const members = [{ email: 'ana@frota.com', organization_id: 'org_1', role: 'owner' }];
  const events = new Set();
  return {
    orgs,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (sql.includes('FROM organizations WHERE id')) {
                const org = orgs.get(args[0]);
                if (!org) return null;
                if (sql.includes('billing_subscription_id FROM')) return { billing_subscription_id: org.billing_subscription_id };
                return { id: org.id };
              }
              if (sql.includes('FROM users')) {
                return members.find((member) => member.email === args[0]) || null;
              }
              return null;
            },
            async run() {
              if (sql.includes('INSERT INTO billing_events')) {
                const key = `${args[2]}:${args[3]}`;
                if (events.has(key)) {
                  const error = new Error('UNIQUE constraint failed: billing_events.external_id');
                  throw error;
                }
                events.add(key);
                return { meta: { changes: 1 } };
              }
              const org = orgs.get(args.at(-1));
              if (!org) return { meta: { changes: 0 } };
              if (sql.includes('billing_status = \'past_due\'')) org.billing_status = 'past_due';
              if (sql.includes('vehicle_limit = NULL')) {
                org.plan = args[0];
                org.vehicle_limit = null;
                org.billing_status = 'active';
                org.billing_subscription_id = args[1] || org.billing_subscription_id;
                org.billing_email = args[2] || org.billing_email;
              }
              if (sql.includes('plan = \'trial\'')) {
                org.plan = 'trial';
                org.vehicle_limit = 2;
                org.billing_status = 'canceled';
              }
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
}
