import { requireAuth, requireRole } from './auth.js';
import { assert, HttpError, json, readJson } from './http.js';

export const PLANS = {
  essential: { name: 'Essencial', unitPrice: 12.9 },
  management: { name: 'Gestão', unitPrice: 19.9 },
  intelligence: { name: 'Inteligência', unitPrice: 29.9 },
};

const encoder = new TextEncoder();

function eventId() {
  return `bil_${crypto.randomUUID().replaceAll('-', '')}`;
}

export function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function cents(value) {
  return Math.round(Number(value) * 100);
}

function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

export function assertMercadoPagoConfigured(env) {
  const token = String(env.MP_ACCESS_TOKEN || '');
  assert(token, 503, 'BILLING_NOT_CONFIGURED', 'Cobrança ainda não configurada. Defina o Access Token de teste do Mercado Pago.');
  if (String(env.MP_SANDBOX) === 'true') {
    assert(token.startsWith('TEST-'), 503, 'BILLING_SANDBOX', 'O sandbox exige um Access Token de teste (TEST-).');
  }
}

async function mpFetch(env, path, options = {}) {
  assertMercadoPagoConfigured(env);
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    method: options.method || 'GET',
    body: options.body,
    headers: {
      authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
      'content-type': 'application/json',
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.message || data?.error || 'Mercado Pago recusou a operação.';
    throw new HttpError(502, 'MP_ERROR', typeof message === 'string' ? message : 'Falha no Mercado Pago.');
  }
  return data;
}

async function vehicleCount(env, organizationId) {
  const count = await env.DB.prepare(
    'SELECT COUNT(*) AS total FROM vehicles WHERE organization_id = ? AND deleted_at IS NULL',
  ).bind(organizationId).first();
  return Math.max(0, Number(count?.total) || 0);
}

function billingSnapshot(org, quantity) {
  const plan = PLANS[org.plan];
  const billedQuantity = org.billing_status === 'active' ? Math.max(1, Number(org.billing_quantity) || quantity) : Math.max(1, quantity);
  return {
    plan: org.plan,
    billingStatus: org.billing_status || 'trial',
    vehicleLimit: org.vehicle_limit ?? null,
    quantity: billedQuantity,
    unitPrice: plan?.unitPrice ?? null,
    amount: plan ? roundMoney(billedQuantity * plan.unitPrice) : 0,
  };
}

async function loadOrganization(env, organizationId) {
  return env.DB.prepare(
    'SELECT id, plan, vehicle_limit, billing_status, billing_quantity, mp_preapproval_id FROM organizations WHERE id = ?',
  ).bind(organizationId).first();
}

export async function getBilling(request, env) {
  const auth = await requireAuth(request, env);
  const org = await loadOrganization(env, auth.organization_id);
  const quantity = await vehicleCount(env, auth.organization_id);
  return json(billingSnapshot(org, quantity));
}

export async function createCheckout(request, env) {
  const auth = await requireAuth(request, env);
  requireRole(auth, ['owner']);
  const body = await readJson(request);
  const planCode = String(body.plan || '');
  const plan = PLANS[planCode];
  assert(plan, 422, 'INVALID_PLAN', 'Escolha Essencial, Gestão ou Inteligência.');

  const quantity = Math.max(1, await vehicleCount(env, auth.organization_id));
  const amount = roundMoney(quantity * plan.unitPrice);
  const origin = new URL(request.url).origin;
  const returnUrl = `${origin}/?billing=return`;
  const preference = await mpFetch(env, '/checkout/preferences', {
    method: 'POST',
    body: JSON.stringify({
      items: [{
        id: planCode,
        title: `Frota Sky — ${plan.name}`,
        description: `${quantity} veículo(s) gerenciado(s) por mês`,
        quantity,
        unit_price: plan.unitPrice,
        currency_id: 'BRL',
      }],
      external_reference: auth.organization_id,
      metadata: {
        plan: planCode,
        organization_id: auth.organization_id,
        quantity: String(quantity),
      },
      back_urls: { success: returnUrl, failure: returnUrl, pending: returnUrl },
      ...(origin.startsWith('https://') ? { auto_return: 'approved' } : {}),
      notification_url: `${origin}/api/billing/webhook`,
    }),
  });

  await env.DB.prepare(`INSERT INTO billing_events
    (id, organization_id, mp_preference_id, plan, status, amount, quantity, payload_json)
    VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)`).bind(
    eventId(),
    auth.organization_id,
    preference.id,
    planCode,
    amount,
    quantity,
    JSON.stringify({ preference_id: preference.id }),
  ).run();

  const url = String(env.MP_SANDBOX) === 'true' ? preference.sandbox_init_point : preference.init_point;
  assert(url, 502, 'MP_ERROR', 'Mercado Pago não devolveu a URL do checkout.');
  return json({ url, plan: planCode, quantity, amount });
}

function metadataValue(metadata, key) {
  if (!metadata || typeof metadata !== 'object') return '';
  const value = metadata[key];
  return value == null ? '' : String(value);
}

async function rememberPayment(env, payment, planCode, status, amount, quantity) {
  const paymentId = String(payment.id);
  const organizationId = String(payment.external_reference || '');
  const payload = JSON.stringify({
    id: paymentId,
    status: payment.status,
    status_detail: payment.status_detail || null,
  });
  const existing = await env.DB.prepare('SELECT id, status FROM billing_events WHERE mp_payment_id = ?').bind(paymentId).first();
  if (existing) {
    await env.DB.prepare(
      'UPDATE billing_events SET status = ?, plan = ?, amount = ?, quantity = ?, payload_json = ? WHERE id = ?',
    ).bind(status, planCode, amount, quantity, payload, existing.id).run();
    return existing;
  }
  const pending = await env.DB.prepare(`SELECT id FROM billing_events
    WHERE organization_id = ? AND plan = ? AND status = 'pending' AND mp_payment_id IS NULL
    ORDER BY created_at DESC LIMIT 1`).bind(organizationId, planCode).first();
  try {
    if (pending) {
      await env.DB.prepare(
        'UPDATE billing_events SET mp_payment_id = ?, status = ?, plan = ?, amount = ?, quantity = ?, payload_json = ? WHERE id = ? AND mp_payment_id IS NULL',
      ).bind(paymentId, status, planCode, amount, quantity, payload, pending.id).run();
      return pending;
    }
    await env.DB.prepare(`INSERT INTO billing_events
      (id, organization_id, mp_payment_id, plan, status, amount, quantity, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      eventId(), organizationId, paymentId, planCode, status, amount, quantity, payload,
    ).run();
  } catch (error) {
    if (!String(error?.message || error).includes('UNIQUE')) throw error;
  }
  return env.DB.prepare('SELECT id, status FROM billing_events WHERE mp_payment_id = ?').bind(paymentId).first();
}

async function ensureSubscription(env, organizationId, payerEmail, planCode, quantity) {
  if (!payerEmail) return null;
  const plan = PLANS[planCode];
  const amount = roundMoney(quantity * plan.unitPrice);
  const org = await loadOrganization(env, organizationId);
  try {
    if (org?.mp_preapproval_id) {
      await mpFetch(env, `/preapproval/${org.mp_preapproval_id}`, {
        method: 'PUT',
        body: JSON.stringify({ auto_recurring: { transaction_amount: amount, currency_id: 'BRL' } }),
      });
      await env.DB.prepare('UPDATE organizations SET billing_quantity = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .bind(quantity, organizationId).run();
      return org.mp_preapproval_id;
    }
    const origin = env.APP_ORIGIN || 'https://frota-sky.davidsgarcia1402.workers.dev';
    const subscription = await mpFetch(env, '/preapproval', {
      method: 'POST',
      body: JSON.stringify({
        reason: `Frota Sky — ${plan.name}`,
        external_reference: organizationId,
        payer_email: payerEmail,
        back_url: `${origin}/?billing=return`,
        status: 'pending',
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: amount,
          currency_id: 'BRL',
        },
      }),
    });
    if (subscription?.id) {
      await env.DB.prepare('UPDATE organizations SET mp_preapproval_id = ?, billing_quantity = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .bind(subscription.id, quantity, organizationId).run();
      return subscription.id;
    }
  } catch (error) {
    console.error('preapproval', error);
  }
  return null;
}

export async function applyPayment(env, payment, { expectedOrganizationId = null } = {}) {
  const organizationId = String(payment?.external_reference || '');
  assert(organizationId, 422, 'INVALID_PAYMENT', 'Pagamento sem organização.');
  if (expectedOrganizationId && expectedOrganizationId !== organizationId) {
    throw new HttpError(403, 'PAYMENT_ORG_MISMATCH', 'Este pagamento não pertence à sua empresa.');
  }
  assert(!payment.currency_id || payment.currency_id === 'BRL', 409, 'PAYMENT_MISMATCH', 'Moeda do pagamento inválida.');

  const org = await loadOrganization(env, organizationId);
  assert(org, 404, 'NOT_FOUND', 'Organização não encontrada.');

  const paymentId = String(payment.id || '');
  assert(paymentId, 422, 'INVALID_PAYMENT', 'Pagamento inválido.');
  const existing = await env.DB.prepare('SELECT id, status FROM billing_events WHERE mp_payment_id = ?').bind(paymentId).first();
  if (existing?.status === 'approved') return billingSnapshot(await loadOrganization(env, organizationId), org.billing_quantity || 1);

  let planCode = metadataValue(payment.metadata, 'plan');
  let quantity = Number(metadataValue(payment.metadata, 'quantity'));
  if (!PLANS[planCode] || !Number.isInteger(quantity) || quantity < 1) {
    const pending = await env.DB.prepare(`SELECT plan, quantity FROM billing_events
      WHERE organization_id = ? AND status = 'pending' AND mp_payment_id IS NULL
      ORDER BY created_at DESC LIMIT 1`).bind(organizationId).first();
    if (!PLANS[planCode]) planCode = pending?.plan || planCode;
    if (!Number.isInteger(quantity) || quantity < 1) quantity = Number(pending?.quantity);
  }
  const plan = PLANS[planCode];
  assert(plan, 422, 'INVALID_PLAN', 'Plano do pagamento não reconhecido.');
  const expected = Number.isInteger(quantity) && quantity >= 1 ? roundMoney(quantity * plan.unitPrice) : null;
  const paid = roundMoney(payment.transaction_amount);
  const amountMatches = expected != null && cents(paid) === cents(expected);
  const status = payment.status === 'approved' && amountMatches
    ? 'approved'
    : (payment.status === 'pending' || payment.status === 'in_process' ? 'pending' : payment.status || 'rejected');

  if (payment.status === 'approved' && !amountMatches) {
    await rememberPayment(env, payment, planCode, 'mismatch', paid, Number.isInteger(quantity) ? quantity : null);
    throw new HttpError(409, 'PAYMENT_MISMATCH', 'Valor do pagamento não confere com o plano.');
  }

  await rememberPayment(env, payment, planCode, status, paid, Number.isInteger(quantity) ? quantity : null);

  if (status === 'approved') {
    const currentVehicles = await vehicleCount(env, organizationId);
    const billedQuantity = Math.max(quantity, currentVehicles, 1);
    await env.DB.prepare(`UPDATE organizations
      SET plan = ?, vehicle_limit = NULL, billing_status = 'active', billing_quantity = ?, updated_at = datetime('now')
      WHERE id = ?`).bind(planCode, billedQuantity, organizationId).run();
    await ensureSubscription(env, organizationId, payment.payer?.email || '', planCode, billedQuantity);
  } else if (status === 'pending' && org.billing_status !== 'active') {
    await env.DB.prepare(`UPDATE organizations SET billing_status = 'pending', updated_at = datetime('now') WHERE id = ?`)
      .bind(organizationId).run();
  }

  return billingSnapshot(await loadOrganization(env, organizationId), await vehicleCount(env, organizationId));
}

export async function confirmPayment(request, env) {
  const auth = await requireAuth(request, env);
  requireRole(auth, ['owner']);
  const body = await readJson(request);
  const paymentId = String(body.paymentId || body.payment_id || '').trim();
  assert(/^\d{1,20}$/.test(paymentId), 422, 'INVALID_PAYMENT', 'Pagamento inválido.');
  const payment = await mpFetch(env, `/v1/payments/${paymentId}`);
  return json(await applyPayment(env, payment, { expectedOrganizationId: auth.organization_id }));
}

export function parseSignature(header) {
  const parts = {};
  for (const piece of String(header || '').split(',')) {
    const [key, ...rest] = piece.split('=');
    if (key && rest.length) parts[key.trim()] = rest.join('=').trim();
  }
  return parts;
}

export async function verifyMercadoPagoSignature(secret, { signature, requestId, dataId }) {
  assert(secret, 503, 'BILLING_NOT_CONFIGURED', 'Webhook do Mercado Pago sem segredo.');
  const parts = parseSignature(signature);
  let id = String(dataId || '');
  if (/[a-z]/i.test(id)) id = id.toLowerCase();
  const manifest = `id:${id};request-id:${requestId || ''};ts:${parts.ts || ''};`;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(manifest));
  const hex = [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  assert(safeEqual(hex, parts.v1 || ''), 401, 'INVALID_SIGNATURE', 'Assinatura do webhook inválida.');
}

export async function handleWebhook(request, env) {
  const url = new URL(request.url);
  const body = await request.json().catch(() => ({}));
  const dataId = url.searchParams.get('data.id') || url.searchParams.get('id') || body?.data?.id || '';
  await verifyMercadoPagoSignature(env.MP_WEBHOOK_SECRET, {
    signature: request.headers.get('x-signature'),
    requestId: request.headers.get('x-request-id'),
    dataId,
  });
  const topic = body?.type || body?.topic || url.searchParams.get('type') || url.searchParams.get('topic') || '';
  if (topic && topic !== 'payment') return json({ ok: true, ignored: topic });
  const paymentId = String(dataId || '');
  assert(/^\d{1,20}$/.test(paymentId), 422, 'INVALID_PAYMENT', 'Notificação sem pagamento.');
  const payment = await mpFetch(env, `/v1/payments/${paymentId}`);
  return json(await applyPayment(env, payment));
}

export async function syncBillingQuantity(env, organizationId) {
  const org = await loadOrganization(env, organizationId);
  if (!org || org.billing_status !== 'active' || !org.mp_preapproval_id || !PLANS[org.plan]) return;
  const quantity = Math.max(1, await vehicleCount(env, organizationId));
  const amount = roundMoney(quantity * PLANS[org.plan].unitPrice);
  try {
    await mpFetch(env, `/preapproval/${org.mp_preapproval_id}`, {
      method: 'PUT',
      body: JSON.stringify({ auto_recurring: { transaction_amount: amount, currency_id: 'BRL' } }),
    });
    await env.DB.prepare('UPDATE organizations SET billing_quantity = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .bind(quantity, organizationId).run();
  } catch (error) {
    console.error('billing-sync', error);
  }
}
