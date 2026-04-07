# Roteiro de Apresentação — BP-Company (Entrevista de Estágio)

## Stack Utilizada

| Camada         | Tecnologia                                        |
| -------------- | ------------------------------------------------- |
| Frontend       | React 19 + JavaScript (JSX)                       |
| Bundler        | Vite 7                                            |
| Roteamento     | React Router DOM 7                                |
| Gráficos       | Recharts                                          |
| Estilização    | CSS Modules                                       |
| PWA            | vite-plugin-pwa                                   |
| Backend        | Python + FastAPI                                  |
| Servidor ASGI  | Uvicorn                                           |
| Validação      | Pydantic 2                                        |
| Banco de Dados | PostgreSQL (psycopg2)                             |
| BPMN / IA      | LLM (GPT-4.1) + bpmn.io + Node.js (layout server) |
| Deploy         | Render                                            |

---

## Contexto Geral (30 segundos)

> "Desenvolvi um sistema web fullstack de gestão comercial com CRM, geração de diagramas BPMN por IA e controle de acesso por perfil."

---

## Roteiro Page by Page

### 1. Login (`/login`)

**O que mostrar:**

- Tela de autenticação
- Criação de conta, recuperação e reset de senha

**O que falar:**

> "Implementei autenticação com contexto global via `UserContext`. Rotas protegidas redirecionam automaticamente — usuário não autenticado nunca acessa páginas internas."

**Conceitos técnicos:** `ProtectedRoute`, React Context, React Router guards

---

### 2. Dashboard (`/dashboard`)

**O que mostrar:**

- Cards de métricas (totais)
- Gráfico de desempenho com Recharts

**O que falar:**

> "O dashboard agrega dados do backend e usa a biblioteca Recharts para visualização. O layout é responsivo com CSS Grid via CSS Modules."

**Conceitos técnicos:** `recharts`, CSS Modules, `grid-template-columns: repeat(auto-fit, ...)`

---

### 3. IA / BPMN Assistant (`/ia`) — ponto forte

**O que mostrar:**

- Chat com IA gerando diagrama BPMN ao vivo
- O diagrama sendo atualizado em tempo real

**O que falar:**

> "Essa é a feature principal. Integrei um assistente de IA que interpreta linguagem natural e gera diagramas BPMN. O módulo usa LLM (GPT-4.1), um servidor de layout em Node.js e renderização com bpmn.io."

**Conceitos técnicos:** integração com LLM, módulo Python separado, arquitetura orientada a microsserviços

---

### 4. Oportunidades / Pipeline (`/oportunidades`)

**O que mostrar:**

- Lista de oportunidades (CRM)
- Tela de detalhe de uma oportunidade
- Pipeline visual

**O que falar:**

> "Implementei um módulo de CRM com pipeline de vendas. Cada oportunidade tem dono, e regras de negócio controlam quem pode editar — centralizadas em `opportunityOwnershipRules.js`."

**Conceitos técnicos:** regras de negócio no frontend, lazy loading de rotas, `React.lazy` + `Suspense`

---

### 5. Entidades (`/entidades`)

**O que mostrar:**

- Listagem de entidades (empresas/contatos)
- Criação de nova entidade

**O que falar:**

> "Entidades representam as empresas parceiras. Usei `EntidadesContext` para compartilhar os dados globalmente e evitar requisições duplicadas."

**Conceitos técnicos:** Context API como cache leve, reutilização de estado global

---

### 6. Usuários (`/usuarios`) — acesso admin

**O que mostrar:**

- Lista de usuários
- Criação de usuário

**O que falar:**

> "Acesso restrito por `AdminRoute`. Controle de permissões centralizado em `accessControl.js`."

**Conceitos técnicos:** RBAC (controle de acesso baseado em perfil)

---

### 7. Gerar BPMN (`/gerar-bpmn`)

**O que mostrar:**

- Fluxo de criação de processo BPMN vinculado a uma oportunidade

**O que falar:**

> "Permite criar e configurar processos BPMN dentro do contexto de uma oportunidade, com etapas definidas em `bpmnStages.js`."

---

## Perguntas Frequentes na Entrevista

| Pergunta                       | O que responder                                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| "Por que React?"               | "Ecossistema maduro, componentização, e já tinha base com hooks e Context API"                       |
| "Como foi o backend?"          | "FastAPI por ser moderno, rápido de desenvolver e com validação automática via Pydantic"             |
| "Qual foi o maior desafio?"    | "Integrar o módulo de IA com o frontend em tempo real e manter o diagrama BPMN sincronizado"         |
| "Trabalharam em equipe?"       | Seja honesto — se foi solo, mostrar que assumiu todas as camadas é ponto positivo                    |
| "O que é um Context no React?" | "É uma forma de compartilhar estado globalmente sem precisar passar props em cadeia (prop drilling)" |
| "O que é uma rota protegida?"  | "É uma rota que redireciona para o login se o usuário não estiver autenticado"                       |
| "O que é PWA?"                 | "Progressive Web App — o app pode ser instalado no celular e funcionar offline com dados em cache"   |

---

## Dica Final

Abra o app rodando **localmente** antes da entrevista e navegue pelas telas nessa ordem.
Tenha o VS Code aberto com o código pronto para mostrar quando perguntarem.
