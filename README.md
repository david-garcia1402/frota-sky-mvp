# Frota Sky — MVP Full-Stack Cloudflare

SaaS B2B para gestão de frotas com cobrança planejada por veículo gerenciado.

Esta versão já deixou de usar `localStorage` como fonte principal e possui backend real preparado para Cloudflare.

## Stack

- React + Vite
- Cloudflare Workers
- Cloudflare D1
- Cloudflare R2
- Cloudflare Static Assets
- Cron Triggers

## Funcional no MVP

- criação de conta e empresa;
- login/logout com sessão server-side;
- isolamento multi-tenant por `organization_id`;
- perfis de permissão;
- veículos e limite de plano;
- motoristas/CNH;
- abastecimentos;
- manutenção preventiva/corretiva;
- fornecedores;
- documentos;
- checklists/inspeções;
- uploads privados para R2;
- dashboard de frota/custos;
- alertas automáticos;
- auditoria;
- trial de 2 veículos;
- CTAs e precificação por veículo.

## 1. Instalação

```bash
npm install
```

## 2. Build do frontend

```bash
npm run build
```

## 3. Teste local full-stack

A migration local usa o D1 emulado pelo Wrangler:

```bash
npm run db:migrate:local
npm run cf:dev
```

Abra a URL exibida pelo Wrangler e crie uma conta pelo CTA **Começar grátis**.

> O `database_id` incluído no repositório é um UUID placeholder apenas para desenvolvimento local. Antes do deploy remoto, substitua pelo ID real criado na sua conta Cloudflare.

## 4. Provisionar no Cloudflare

Autentique o Wrangler:

```bash
npx wrangler login
```

Crie o banco:

```bash
npx wrangler d1 create frota-sky-db
```

Copie o `database_id` retornado e substitua o UUID placeholder em `wrangler.jsonc`.

Crie o bucket:

```bash
npx wrangler r2 bucket create frota-sky-files
```

Aplique as migrations no D1 remoto:

```bash
npm run db:migrate:remote
```

## 5. Deploy

```bash
npm run deploy
```

O mesmo Worker atende `/api/*` e os assets React compilados em `dist/`.

## Estrutura

```text
frota-sky/
├── src/
│   ├── api.js
│   ├── main.jsx
│   └── styles.css
├── worker/
│   ├── index.js
│   └── lib/
│       ├── auth.js
│       ├── crypto.js
│       └── http.js
├── migrations/
│   └── 0001_initial.sql
├── docs/
│   ├── API.md
│   └── PR_DESCRIPTION.md
├── wrangler.jsonc
├── package.json
└── index.html
```

## Regra comercial atual

O cadastro cria o plano `trial`, com limite de 2 veículos.

Precificação exibida no produto:

| Plano | Valor por veículo/mês |
| --- | ---: |
| Essencial | R$ 12,90 |
| Gestão | R$ 19,90 |
| Inteligência | R$ 29,90 |

O gateway ainda não faz parte deste MVP; o schema já mantém `plan` e `vehicle_limit` na organização para a futura integração de billing.

## Segurança do MVP

- PBKDF2-SHA256 com salt e 210.000 iterações para senha;
- tokens de sessão aleatórios e persistência somente do hash;
- cookie HttpOnly/Secure/SameSite=Lax;
- sessão de 30 dias;
- RBAC no Worker;
- tenant filtering por organização;
- uploads privados em R2;
- arquivos limitados a 8 MB e MIME types aprovados;
- logs de auditoria para mutações principais.

## Documentação

Consulte `docs/API.md` para as rotas e `docs/PR_DESCRIPTION.md` para uma descrição padronizada que pode ser usada quando o projeto passar a adotar pull requests.
