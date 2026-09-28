# Frota Sky — API MVP

Todas as rotas usam o mesmo domínio do frontend e prefixo `/api`. Sessões são mantidas em cookie `HttpOnly`, `Secure` e `SameSite=Lax`.

## Autenticação

- `POST /api/auth/register` — cria usuário owner + organização trial (2 veículos) + sessão.
- `POST /api/auth/login` — autentica e cria sessão.
- `POST /api/auth/logout` — invalida a sessão atual.
- `GET /api/auth/me` — retorna usuário e organização atual.

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

## Cobrança (Kiwify)

- `POST /api/webhooks/kiwify` — recebe eventos da Kiwify. Exige `KIWIFY_WEBHOOK_TOKEN` na query `token` ou uma assinatura HMAC-SHA1 do corpo cru no header `signature` / `x-kiwify-signature`.

Eventos que ativam o plano (`essential`, `management`, `intelligence`) e removem o limite de veículos: `order_approved`, `compra_aprovada`, `subscription_renewed`, `subscription_reactivated`.

Eventos que devolvem o teste de 2 veículos: `order_refunded`, `compra_reembolsada`, `chargeback`, `subscription_canceled`.

A empresa é localizada por `TrackingParameters.src` (id da organização) e, se não houver, pelo e-mail do cliente entre os owners/admins. O plano vem do nome do produto (Essencial, Gestão, Inteligência) ou das variáveis `KIWIFY_PRODUCT_*`.

## Perfis

- `owner`: controle total do tenant.
- `admin`: administração operacional.
- `manager`: criação/edição operacional.
- `driver`: reservado para PWA do motorista.
- `viewer`: leitura.

O backend valida `organization_id` nas consultas e mutações sensíveis.
