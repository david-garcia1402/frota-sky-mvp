# Frota Sky — API MVP

Todas as rotas usam o mesmo domínio do frontend e prefixo `/api`. Sessões são mantidas em cookie `HttpOnly`, `Secure` e `SameSite=Lax`.

## Autenticação

- `POST /api/auth/register` — cria usuário owner + organização trial (2 veículos) + sessão.
- `POST /api/auth/login` — autentica e cria sessão.
- `POST /api/auth/logout` — invalida a sessão atual.
- `GET /api/auth/me` — retorna usuário e organização atual, inclusive `plan`, `vehicleLimit` e `billingStatus`.

Quem chama checkout e confirmação precisa estar autenticado com papel `owner`. O webhook é público e só aceita a assinatura do Mercado Pago.

## Cobrança

- `GET /api/billing` — plano, status (`trial`, `pending`, `active`, `cancelled`), quantidade e valor.
- `POST /api/billing/checkout` — body `{ "plan": "essential" | "management" | "intelligence" }`. Cria a preferência do Checkout Pro e devolve `{ url, quantity, amount }`. No sandbox, `url` é o `sandbox_init_point`.
- `POST /api/billing/confirm` — body `{ "paymentId": "123" }`. Consulta o pagamento no Mercado Pago e só libera o plano se `status` for `approved`, a organização for a da sessão e o valor bater com quantidade × preço.
- `POST /api/billing/webhook` — notificação de pagamento. Valida `x-signature` com `MP_WEBHOOK_SECRET` e aplica a mesma regra.

Preço por veículo/mês: Essencial R$ 12,90, Gestão R$ 19,90, Inteligência R$ 29,90. A quantidade é o número de veículos ativos, com mínimo 1. Pagamento aprovado grava o plano e remove o teto de 2 veículos. Pagamento pendente ou recusado mantém o teste.

Segredos do Worker, fora do git: `MP_ACCESS_TOKEN` (token `TEST-` enquanto `MP_SANDBOX=true`) e `MP_WEBHOOK_SECRET`. A URL do webhook em produção é `https://frota-sky.davidsgarcia1402.workers.dev/api/billing/webhook`.

## Dashboard

- `GET /api/dashboard` — KPIs de frota, custos do mês e alertas.

## Veículos

- `GET /api/vehicles?q=` — lista/busca veículos do tenant.
- `POST /api/vehicles` — cria veículo; respeita limite do plano.
- `PATCH /api/vehicles/:id` — atualiza veículo.
- `DELETE /api/vehicles/:id` — soft delete (owner/admin).

## Motoristas

- `GET /api/drivers`
- `POST /api/drivers`

## Combustível

- `GET /api/fuel?vehicleId=`
- `POST /api/fuel` — registra litros/custo/odômetro e atualiza KM do veículo.

## Manutenção

- `GET /api/maintenance`
- `POST /api/maintenance` — preventiva/corretiva com próxima data/KM.

## Fornecedores

- `GET /api/suppliers`
- `POST /api/suppliers`

## Documentos

- `GET /api/documents?entityType=vehicle&entityId=<id>`
- `POST /api/documents` — metadados de CNH/IPVA/licenciamento/seguro etc.

## Inspeções / checklists

- `GET /api/inspections`
- `POST /api/inspections` — checklist JSON, KM, status e observações.

## Arquivos (R2)

- `PUT /api/uploads/:kind/:entityId` — corpo binário; aceita JPG, PNG, WEBP ou PDF; máximo 8 MB.
- `GET /api/files/:id` — download autenticado e isolado por tenant.

`kind` aceito no MVP: `inspection`, `driver-document`, `vehicle-document`.

## Alertas

- `GET /api/alerts`
- `POST /api/alerts/:id/read`

O Cron diário gera alertas de CNH e manutenção por KM e remove sessões expiradas.

## Perfis

- `owner`: controle total do tenant.
- `admin`: administração operacional.
- `manager`: criação/edição operacional.
- `driver`: reservado para PWA do motorista.
- `viewer`: leitura.

O backend valida `organization_id` nas consultas e mutações sensíveis.
