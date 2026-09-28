import { PLANS } from '../../shared/plans.js';

const encoder = new TextEncoder();

const ACTIVATE_EVENTS = new Set([
  'order_approved',
  'compra_aprovada',
  'subscription_renewed',
  'subscription_reactivated',
]);

const REVOKE_EVENTS = new Set([
  'order_refunded',
  'compra_reembolsada',
  'chargeback',
  'subscription_canceled',
  'subscription_cancelled',
]);

const PAST_DUE_EVENTS = new Set(['subscription_late']);

const PLAN_IDS = new Set(PLANS.map((plan) => plan.id));

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function safeEqual(leftValue, rightValue) {
  const left = String(leftValue ?? '');
  const right = String(rightValue ?? '');
  const length = Math.max(left.length, right.length);
  let mismatch = left.length === right.length ? 0 : 1;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

export async function kiwifySignatureMatches(rawBody, signature, secret) {
  const provided = String(signature || '').trim().replace(/^sha1=/i, '').toLowerCase();
  if (!/^[0-9a-f]+$/.test(provided) || !secret) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
  const hex = [...new Uint8Array(signed)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return safeEqual(hex, provided);
}

export async function isKiwifyAuthorized(request, rawBody, secret) {
  if (!secret) return false;
  const url = new URL(request.url);
  const token = url.searchParams.get('token') || request.headers.get('x-kiwify-token') || '';
  if (token && safeEqual(token, secret)) return true;
  const signature = request.headers.get('x-kiwify-signature')
    || request.headers.get('signature')
    || url.searchParams.get('signature')
    || '';
  if (!signature) return false;
  return kiwifySignatureMatches(rawBody, signature, secret);
}

function objectOf(body, ...keys) {
  for (const key of keys) {
    if (body && typeof body[key] === 'object' && body[key]) return body[key];
  }
  return {};
}

export function interpretKiwifyEvent(body = {}, env = {}) {
  const eventType = normalize(body.webhook_event_type || body.event || body.event_type).replace(/\s+/g, '_');
  const product = objectOf(body, 'Product', 'product');
  const customer = objectOf(body, 'Customer', 'customer');
  const tracking = objectOf(body, 'TrackingParameters', 'tracking_parameters', 'tracking');
  const subscription = objectOf(body, 'Subscription', 'subscription');
  const productId = String(product.product_id || product.id || body.product_id || '');
  const productName = String(product.product_name || product.name || body.product_name || '');
  const email = String(customer.email || customer.Email || body.email || '').trim().toLowerCase();
  const organizationId = [tracking.src, tracking.sck, tracking.utm_content, body.src]
    .map((value) => String(value || '').trim())
    .find((value) => value.startsWith('org_')) || null;
  const subscriptionId = String(body.subscription_id || subscription.id || subscription.subscription_id || '').trim();
  const externalId = String(body.order_id || body.order_ref || subscriptionId || '').trim();
  let action = 'ignore';
  if (ACTIVATE_EVENTS.has(eventType)) action = 'activate';
  else if (REVOKE_EVENTS.has(eventType)) action = 'revoke';
  else if (PAST_DUE_EVENTS.has(eventType)) action = 'past_due';
  return {
    eventType: eventType || 'unknown',
    action,
    planId: resolvePlanId(productId, productName, env),
    email,
    organizationId,
    subscriptionId,
    externalId,
    productName,
  };
}

export function resolvePlanId(productId, productName, env = {}) {
  const id = String(productId || '');
  if (id && id === env.KIWIFY_PRODUCT_ESSENTIAL) return 'essential';
  if (id && id === env.KIWIFY_PRODUCT_MANAGEMENT) return 'management';
  if (id && id === env.KIWIFY_PRODUCT_INTELLIGENCE) return 'intelligence';
  const name = normalize(productName);
  if (name.includes('essencial') || name.includes('essential')) return 'essential';
  if (name.includes('intelig')) return 'intelligence';
  if (name.includes('gest')) return 'management';
  if (PLAN_IDS.has(name)) return name;
  return null;
}

function billingId() {
  return `bil_${crypto.randomUUID().replaceAll('-', '')}`;
}

async function resolveOrganizationId(env, event) {
  if (event.organizationId) {
    const org = await env.DB.prepare('SELECT id FROM organizations WHERE id = ?').bind(event.organizationId).first();
    if (org) return org.id;
  }
  if (event.email) {
    const row = await env.DB.prepare(`SELECT om.organization_id
      FROM users u JOIN organization_members om ON om.user_id = u.id
      WHERE u.email = ? AND om.role IN ('owner', 'admin')
      ORDER BY CASE om.role WHEN 'owner' THEN 0 ELSE 1 END, om.created_at ASC
      LIMIT 1`).bind(event.email).first();
    if (row) return row.organization_id;
  }
  return null;
}

export async function applyKiwifyWebhook(env, body) {
  const event = interpretKiwifyEvent(body, env);
  const externalId = event.externalId || await sha256Hex(JSON.stringify(body));
  const organizationId = await resolveOrganizationId(env, event);
  const payload = JSON.stringify(body).slice(0, 20000);
  try {
    await env.DB.prepare(`INSERT INTO billing_events
      (id, organization_id, provider, event_type, external_id, plan, payload_json)
      VALUES (?, ?, 'kiwify', ?, ?, ?, ?)`).bind(
      billingId(),
      organizationId,
      event.eventType,
      externalId,
      event.planId,
      payload,
    ).run();
  } catch (error) {
    if (String(error?.message || error).includes('UNIQUE')) return { duplicate: true, applied: false };
    throw error;
  }

  if (!organizationId) return { applied: false, reason: 'organization_not_found' };
  if (event.action === 'ignore') return { applied: false, reason: 'ignored_event' };

  if (event.action === 'past_due') {
    await env.DB.prepare(`UPDATE organizations SET billing_status = 'past_due', updated_at = datetime('now') WHERE id = ?`)
      .bind(organizationId).run();
    return { applied: true, organizationId, billingStatus: 'past_due' };
  }

  if (event.action === 'activate') {
    if (!event.planId) return { applied: false, reason: 'unknown_product' };
    await env.DB.prepare(`UPDATE organizations
      SET plan = ?, vehicle_limit = NULL, billing_status = 'active',
          billing_subscription_id = COALESCE(?, billing_subscription_id),
          billing_email = COALESCE(?, billing_email),
          updated_at = datetime('now')
      WHERE id = ?`).bind(event.planId, event.subscriptionId || null, event.email || null, organizationId).run();
    return { applied: true, organizationId, plan: event.planId };
  }

  const current = await env.DB.prepare('SELECT billing_subscription_id FROM organizations WHERE id = ?')
    .bind(organizationId).first();
  if (event.subscriptionId && current?.billing_subscription_id && current.billing_subscription_id !== event.subscriptionId) {
    return { applied: false, reason: 'subscription_mismatch' };
  }
  await env.DB.prepare(`UPDATE organizations
    SET plan = 'trial', vehicle_limit = 2, billing_status = 'canceled', updated_at = datetime('now')
    WHERE id = ?`).bind(organizationId).run();
  return { applied: true, organizationId, plan: 'trial' };
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
