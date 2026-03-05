# 🚀 BP8 — Sistema de Gestão de Business Process Flow

> Software para gestão e controle de mudanças organizacionais, com foco em simplicidade, rastreabilidade e transformação digital.

---

## 👥 Equipe — Grupo 08

| Nome                              | GitHub                             |
| --------------------------------- | ---------------------------------- |
| André Luiz Oliveira               | @Andrew8oliveira                   |
| Bertrand Otoniel Pereira Carvalho | @Bertrand-Otoniel-Pereira-Carvalho |
| Gustavo Goulart Caldas Araújo     | @gustavogoul                       |
| Maurício Rodrigues Lima           | @mauricio-rodrigues-lima           |
| Renan Naves                       | @Renan-Frontend                    |

**Parceiro:** BP Company
**Orientador:** Dr. Jackson Barbosa
**Programa:** Residência em Tecnologia da Informação e Comunicação

---

O link para o protótipo de alta fidelidade está no [Figma](https://www.figma.com/proto/TPxGrcT5GDHnRwZzfdPtrq/BP-Company?page-id=0%3A1&node-id=91-1098&p=f&viewport=-3008%2C63%2C0.5&t=kcqExPSocgCH9fSA-1&scaling=min-zoom&content-scaling=fixed&starting-point-node-id=91%3A1098&show-proto-sidebar=1).

# 📌 1. Visão Geral do Projeto

O **BP8** é um sistema de apoio à gestão de fluxos de processos de negócio (_Business Process Flow_) desenvolvido no contexto da residência tecnológica.

O projeto surge como solução para substituir:

- ❌ Planilhas Excel descentralizadas
- ❌ Processos informais via e-mail
- ❌ Falta de rastreabilidade
- ❌ Retrabalho operacional
- ❌ Baixa governança de dados

Por uma plataforma:

- ✅ Centralizada
- ✅ Auditável
- ✅ Estruturada
- ✅ Escalável
- ✅ Integrada com indicadores

---

# 🎯 2. Objetivo Estratégico

O BP8 busca:

- Reduzir retrabalho e perda de dados
- Melhorar rastreabilidade
- Padronizar fluxos operacionais
- Apoiar tomada de decisão com dados confiáveis
- Modernizar a gestão de processos

O projeto foi desenvolvido com potencial de:

- Evolução para produto comercial
- Escalabilidade corporativa
- Integração com LLMs para geração automatizada de BPMN

---

# 🏗 3. Arquitetura do Projeto

## 🔹 Frontend

- React
- Vite
- CSS Modules
- Arquitetura modular por componentes
- Hooks customizados

## 🔹 Backend (estrutura prevista no PRD)

- APIs REST
- Banco estruturado
- Controle de autenticação e autorização
- Camadas bem definidas

---

# 📂 4. Estrutura de Diretórios

```
/documentacao
/app
/Frontend
/Backend
```

Cada diretório possui seu próprio `README.md`, conforme definido no template inicial do repositório

---

# 🧩 5. Principais Implementações Técnicas

---

# 🎯 5.1 EditablePipeline (Componente Interativo)

Transformação do SVG estático `regua.svg` em um componente React totalmente interativo.

📌 Documentação detalhada disponível em
📌 Guia completo disponível em
📌 FAQ completo disponível em
📌 Checklist de testes disponível em

## ✨ Funcionalidades

- Editar etapas inline
- Marcar etapa como concluída
- Adicionar novas etapas
- Remover etapas (com validação)
- Persistência via callback `onSave`
- Navegação por teclado
- Responsivo
- Zero dependências externas

## 📦 Estrutura

```
EditablePipeline.jsx (~97 linhas)
EditablePipeline.module.css (~249 linhas)
```

## 🚀 Uso Básico

```jsx
<EditablePipeline
  initialStages={[
    { id: 1, label: 'Qualificar', done: true },
    { id: 2, label: 'Desenvolver', done: false },
  ]}
  onSave={(updatedStages) => console.log(updatedStages)}
/>
```

---

# 📄 5.2 Sistema de Paginação Reutilizável

Refatoração completa da lógica de paginação da aplicação.

📌 Guia de uso:
📌 Resumo técnico da refatoração:

## 🔹 Hook Customizado

```
usePagination(items, itemsPerPage)
```

Retorna:

- currentPage
- totalPages
- paginatedItems
- nextPage()
- prevPage()
- goToPage()

## 🔹 Componente UI

```
<Pagination />
```

### Benefícios

- Eliminação de código duplicado
- UI consistente
- Código 38% mais enxuto (Opportunities)
- Padronização do projeto

---

# 👤 6. Personas do Sistema

| Persona               | Nível | Objetivo               |
| --------------------- | ----- | ---------------------- |
| Gestor Estratégico    | 3     | Monitorar indicadores  |
| Analista de Processos | 3     | Modelar fluxos         |
| Operador              | 2     | Executar tarefas       |
| Usuário de Negócio    | 1     | Visualizar indicadores |

Baseado no PRD completo

---

# 🔐 7. Requisitos Não Funcionais

Conforme PRD

Inclui:

- Segurança (LGPD)
- Controle de acesso
- Performance
- Disponibilidade
- Backup
- Manutenibilidade
- Arquitetura em camadas
- Versionamento

---

# 📊 8. Métricas de Sucesso

- Protótipo funcional entregue
- 2 entidades mínimas implementadas
- APIs funcionais
- Testes com pelo menos 3 usuários
- Execução completa do fluxo BPF

Conforme definição SMART

---

# 🧪 9. Testes e Validação

Checklist completo disponível em

Valida:

- Edição de etapas
- Toggle de status
- Adição
- Remoção
- Persistência
- Responsividade
- Estados visuais

---

# ⚙️ 10. Setup do Projeto

Baseado no template React + Vite

## Instalação

```bash
npm install
npm run dev
```

Servidor:

```
http://localhost:5173
```

---

# 📚 11. Documentação Complementar

| Documento                | Descrição               |
| ------------------------ | ----------------------- |
| README EditablePipeline  | Guia rápido             |
| GUIDE EditablePipeline   | Documentação completa   |
| FAQ EditablePipeline     | 20 perguntas frequentes |
| TESTING EditablePipeline | Checklist completo      |
| SUMMARY EditablePipeline | Resumo técnico          |
| DOCUMENTATION_INDEX      | Índice navegável        |

Índice centralizado disponível em

---

# 🚀 12. Roadmap Futuro

- Drag and Drop nas etapas
- Histórico de alterações
- Integração com banco real
- Dashboard de KPIs
- Integração LLM para geração BPMN
- Modo Offline completo com sincronização

---

# 🏆 13. Status do Projeto

✅ Protótipo funcional
✅ Componentização React
✅ Refatoração de paginação
✅ Documentação extensa
✅ Padrões estabelecidos
✅ Checklist de validação

---

# 💡 14. Diferencial Competitivo

O BP8 posiciona-se entre:

- Ferramentas complexas de BPM
- Planilhas informais

Oferecendo:

- Interface visual intuitiva
- Integração tecnológica moderna
- Escalabilidade
- Simplicidade operacional
- Suporte a LLM

---

# 📜 15. Licença

Projeto acadêmico desenvolvido no contexto da Residência em Tecnologia da Informação.

---
