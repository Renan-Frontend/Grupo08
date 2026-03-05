# BP Company (v0.1 - Primeira versão pública)

Este repositório contém a primeira versão pública da BP Company para apresentação e validação inicial.

## Status

- Versão: **v0.1 (alpha)**
- Objetivo: disponibilizar uma base funcional no GitHub
- Observação: o produto **ainda não está finalizado**

## Estrutura

- `Frontend/` — aplicação React + Vite
- `Backend/` — API FastAPI

## Requisitos

- Node.js 20+
- Python 3.10+

## Configuração rápida

### 1) Frontend

```bash
cd Frontend
cp .env.example .env
npm install
npm run dev
```

### 2) Backend

```bash
cd Backend
python -m venv .venv
source .venv/Scripts/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload
```

## Variáveis de ambiente

### Frontend (`Frontend/.env`)

- `VITE_API_URL` — URL base da API (ex: `http://127.0.0.1:8000`)

### Backend (`Backend/.env`)

- `FRONTEND_URL` — URL do frontend para links de recuperação de senha
- `ALLOWED_ORIGINS` — lista separada por vírgula para CORS
- `MAILGUN_API_KEY` e `MAILGUN_DOMAIN` — opcionais para envio de email

## Endpoints úteis

- `GET /health` — healthcheck da API
- `GET /users`
- `GET /oportunidades`

## Publicação (primeira versão)

- Suba o código no GitHub como `v0.1-alpha`
- Configure variáveis de ambiente no serviço de hospedagem
- Publique o frontend em um host estático (Vercel/Netlify/GitHub Pages)
- Publique o backend em um serviço Python (Render/Railway/Fly)

## Deploy com Supabase + Render

Este repositório já possui blueprint de deploy em `render.yaml` para subir:

- `bp-company-backend` (FastAPI)
- `bp-company-frontend` (React/Vite estático)

Guia operacional rápido: `DEPLOY_RENDER_SUPABASE.md`.

### 1) Criar projeto no Supabase

1. Crie um novo projeto no Supabase.
2. Em **Project Settings > API**, copie:
   - `Project URL`
   - `anon public key`
   - `service_role key` (uso apenas no backend)
3. Em **Project Settings > Database**, copie a string de conexão (`SUPABASE_DB_URL`).

### 2) Deploy no Render via Blueprint

1. Faça push deste repositório no GitHub.
2. No Render, escolha **New + > Blueprint**.
3. Selecione o repositório e confirme o `render.yaml`.
4. Preencha as variáveis de ambiente:

### 2.1) Preparação local (recomendado)

1. Gere os arquivos de ambiente a partir dos templates:

```bash
cp Backend/.env.render.example Backend/.env
cp Frontend/.env.render.example Frontend/.env
```

2. Preencha os valores reais (URLs/chaves).

3. Valide a configuração antes do deploy:

```bash
npm run deploy:check
```

Para bloquear deploy com qualquer pendência, use:

```bash
npm run deploy:check:strict
```

#### Backend (`bp-company-backend`)

- `FRONTEND_URL=https://SEU_FRONTEND.onrender.com/`
- `ALLOWED_ORIGINS=https://SEU_FRONTEND.onrender.com`
- `MAILGUN_API_KEY` (opcional)
- `MAILGUN_DOMAIN` (opcional)
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL`

> Dica: prefira `SUPABASE_DB_URL` com `sslmode=require`.

#### Frontend (`bp-company-frontend`)

- `VITE_API_URL=https://SEU_BACKEND.onrender.com`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### 3) Status da persistência nesta versão

- Com `SUPABASE_DB_URL` configurada, o backend persiste `users`, `entidades`, `oportunidades` e `bpmn-editor/state` no Postgres do Supabase.
- Na primeira inicialização com banco vazio, os dados JSON locais são importados automaticamente para o banco.
- Se `SUPABASE_DB_URL` não estiver configurada, o backend mantém o modo fallback em JSON (`Backend/users.json`, `Backend/oportunidades.json`, `Backend/entidades.json`).

### 4) Próxima etapa recomendada (produção)

- Evoluir autenticação fake (`fake-token-*`) para autenticação real com Supabase Auth/JWT.
- Restringir `SUPABASE_SERVICE_ROLE_KEY` ao backend e aplicar políticas RLS quando necessário.

## Próximos passos recomendados

- Validar o deploy em ambiente real (Render + Supabase) com dados de homologação
- Adicionar testes automatizados
- Revisar autenticação/token para ambiente de produção

## Pós-deploy (ordem sugerida)

1. Abra o backend no browser e valide `GET /health`.
2. Abra o frontend e execute login + CRUD de usuários, entidades e oportunidades.
3. Crie/edite um BPMN e confirme persistência após reiniciar o backend no Render.
4. Se houver erro de CORS, revise `ALLOWED_ORIGINS` e `FRONTEND_URL`.
5. Se houver erro de banco, revise `SUPABASE_DB_URL` (com `sslmode=require`).
