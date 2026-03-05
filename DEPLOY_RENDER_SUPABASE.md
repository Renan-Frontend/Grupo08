# Deploy Render + Supabase (BP Company)

Guia rápido para subir backend + frontend com persistência em Supabase Postgres.

## 1) Preparar variáveis localmente

### Bash

```bash
cp Backend/.env.render.example Backend/.env
cp Frontend/.env.render.example Frontend/.env
npm run deploy:check
```

### PowerShell

```powershell
Copy-Item Backend/.env.render.example Backend/.env
Copy-Item Frontend/.env.render.example Frontend/.env
npm run deploy:check
```

Se quiser exigir 100% de conformidade:

```bash
npm run deploy:check:strict
```

## 2) Configurar Supabase

1. Crie um projeto no Supabase.
2. Copie `Project URL`, `anon key`, `service_role key`.
3. Copie a conexão Postgres (`SUPABASE_DB_URL`) com `sslmode=require`.

## 3) Subir no Render

1. Faça push do repositório.
2. No Render: **New + > Blueprint**.
3. Selecione o repositório e confirme `render.yaml`.
4. Preencha env vars:

### Backend (`bp-company-backend`)

- `FRONTEND_URL=https://SEU_FRONTEND.onrender.com`
- `ALLOWED_ORIGINS=https://SEU_FRONTEND.onrender.com`
- `SUPABASE_DB_URL=postgresql://...?...sslmode=require`
- `SUPABASE_URL` (opcional)
- `SUPABASE_ANON_KEY` (opcional)
- `SUPABASE_SERVICE_ROLE_KEY` (opcional)
- `MAILGUN_API_KEY` (opcional)
- `MAILGUN_DOMAIN` (opcional)

### Frontend (`bp-company-frontend`)

- `VITE_API_URL=https://SEU_BACKEND.onrender.com`
- `VITE_SUPABASE_URL` (opcional)
- `VITE_SUPABASE_ANON_KEY` (opcional)

## 4) O que acontece no primeiro boot

- O backend cria as tabelas no Postgres (quando `SUPABASE_DB_URL` está presente).
- Se as tabelas estiverem vazias, os JSON locais são importados automaticamente.
- Sem `SUPABASE_DB_URL`, o backend entra em fallback JSON.

## 5) Pós-deploy (checklist)

1. Testar `GET /health` no backend.
2. Abrir frontend e validar login.
3. Criar/editar usuário, entidade e oportunidade.
4. Criar/editar BPMN.
5. Reiniciar backend no Render e confirmar persistência dos dados.

## 6) Troubleshooting

- **CORS**: ajuste `ALLOWED_ORIGINS` e `FRONTEND_URL`.
- **DB connection error**: confira `SUPABASE_DB_URL` e `sslmode=require`.
- **Dados não persistem**: verifique se `SUPABASE_DB_URL` está realmente setada no backend do Render.
