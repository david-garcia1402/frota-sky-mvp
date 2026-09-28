export const SALES_PAGE_URL = 'https://kiwify.app/lsdA7La';

export const PLANS = [
  {
    id: 'essential',
    name: 'Essencial',
    value: 12.9,
    text: 'Controle básico para sair das planilhas.',
    checkoutUrl: 'https://pay.kiwify.com.br/9DUQjYR',
  },
  {
    id: 'management',
    name: 'Gestão',
    value: 19.9,
    text: 'Operação completa, custos, OS e checklists.',
    featured: true,
    checkoutUrl: 'https://pay.kiwify.com.br/vUnXhqQ',
  },
  {
    id: 'intelligence',
    name: 'Inteligência',
    value: 29.9,
    text: 'Integrações, automações e IA sob demanda.',
    checkoutUrl: 'https://pay.kiwify.com.br/Hrk6kF9',
  },
];

export const PLAN_LABELS = {
  trial: 'Teste grátis',
  essential: 'Essencial',
  management: 'Gestão',
  intelligence: 'Inteligência',
};

export function planLabel(plan) {
  return PLAN_LABELS[plan] || PLAN_LABELS.trial;
}

export function checkoutUrl(plan, customer = {}) {
  const url = new URL(plan.checkoutUrl);
  if (customer.email) url.searchParams.set('email', customer.email);
  if (customer.name) url.searchParams.set('name', customer.name);
  if (customer.organizationId) {
    url.searchParams.set('src', customer.organizationId);
    url.searchParams.set('sck', customer.organizationId);
  }
  url.searchParams.set('utm_source', 'frota-sky');
  url.searchParams.set('utm_medium', 'app');
  url.searchParams.set('utm_campaign', plan.id);
  return url.toString();
}
