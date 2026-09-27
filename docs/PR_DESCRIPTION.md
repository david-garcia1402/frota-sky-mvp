# feat: backend MVP Cloudflare + autenticação multi-tenant

## Contexto

Esta mudança transforma o Frota Sky de uma interface demonstrativa em uma base de SaaS funcional para gestão de frotas, preparada para operar no ecossistema Cloudflare com custo inicial baixo.

## Objetivo

Disponibilizar um MVP full-stack capaz de:

- cadastrar empresas e usuários;
- isolar dados por organização;
- gerenciar veículos e motoristas;
- registrar combustível e manutenção;
- armazenar documentos/checklists/fotos;
- calcular indicadores operacionais básicos;
- gerar alertas automáticos;
- suportar trial de até 2 veículos e futura cobrança por veículo gerenciado.

## Arquitetura

- Frontend: React + Vite.
- Runtime/API: Cloudflare Workers.
- Banco relacional: Cloudflare D1.
- Storage de fotos/documentos: Cloudflare R2.
- Static Assets: servidos pelo mesmo Worker.
- Jobs: Cron Trigger diário.
- Autenticação: sessão server-side em D1 com cookie HttpOnly.

## Principais mudanças

### Autenticação e tenancy

- Cadastro cria usuário owner e organização trial.
- Login/logout e consulta de sessão.
- Senhas com PBKDF2-SHA256 e salt aleatório.
- Tokens de sessão aleatórios; somente o hash é persistido.
- Todas as entidades operacionais relevantes carregam `organization_id`.
- RBAC inicial: owner, admin, manager, driver e viewer.

### Gestão de frota

- CRUD MVP de veículos.
- Cadastro de motoristas e dados de CNH.
- Registro de abastecimentos com atualização de odômetro.
- Registro de manutenção preventiva/corretiva.
- Cadastro de fornecedores.
- Documentos por veículo/motorista/organização.
- Inspeções/checklists estruturados em JSON.
- Auditoria de ações críticas.

### Arquivos

- Upload autenticado para R2.
- Tipos permitidos: JPG, PNG, WEBP e PDF.
- Limite de 8 MB por arquivo.
- Download exige sessão e organização correspondente.

### Dashboard e alertas

- Quantidade/status da frota.
- Custos mensais de combustível e manutenção.
- Central de alertas.
- Cron diário para vencimentos/manutenção e limpeza de sessões expiradas.

### Comercial / CTA

- Trial sem cartão com até 2 veículos.
- CTA principal: “Começar grátis”.
- Precificação apresentada por veículo/mês:
  - Essencial: R$ 12,90;
  - Gestão: R$ 19,90;
  - Inteligência: R$ 29,90.

## Banco de dados

Migration inicial cria:

- users
- organizations
- organization_members
- sessions
- drivers
- vehicles
- fuel_entries
- suppliers
- maintenance_records
- alerts
- files
- audit_logs
- documents
- inspections

Também adiciona índices para consultas por tenant, veículo, data e alertas.

## Segurança

- Nenhuma senha é armazenada em texto puro.
- Cookie de sessão é `HttpOnly`, `Secure` e `SameSite=Lax`.
- Sessões expiram em 30 dias.
- Uploads são privados e acessados via Worker autenticado.
- Queries operacionais são filtradas por `organization_id`.
- Exclusão de veículo é lógica (soft delete).
- Permissões são validadas no Worker.

## Como validar

```bash
npm install
npm run build
node --check worker/index.js
```

Para testar com D1 local:

```bash
npm run db:migrate:local
npm run cf:dev
```

Fluxo mínimo de aceite:

1. criar conta;
2. validar sessão;
3. cadastrar motorista;
4. cadastrar veículo;
5. registrar abastecimento;
6. registrar manutenção;
7. validar dashboard;
8. sair e entrar novamente;
9. confirmar que os dados permanecem;
10. tentar cadastrar o terceiro veículo no trial e confirmar bloqueio pelo limite.

## Deploy Cloudflare

1. criar D1 `frota-sky-db`;
2. substituir `database_id` em `wrangler.jsonc`;
3. criar bucket R2 `frota-sky-files`;
4. aplicar migrations remotas;
5. executar `npm run deploy`.

## Fora de escopo deste MVP

- cobrança/gateway efetivo;
- recuperação de senha por e-mail;
- convite multiusuário pela interface;
- integração WhatsApp;
- integração com rastreadores/GPS;
- IA de previsão/anomalias em produção;
- app/PWA completo do motorista;
- relatórios avançados/exportação fiscal.

## Checklist

- [x] Backend Worker
- [x] D1 + migrations
- [x] R2 bindings
- [x] Auth + sessão
- [x] Multi-tenant
- [x] RBAC inicial
- [x] Veículos
- [x] Motoristas
- [x] Combustível
- [x] Manutenção
- [x] Fornecedores
- [x] Documentos
- [x] Checklists/inspeções
- [x] Alertas
- [x] Auditoria
- [x] Frontend consumindo API
- [x] Pricing/CTA por veículo
- [x] Documentação de deploy
