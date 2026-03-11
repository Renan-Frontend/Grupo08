# Homologacao - Criar BPMN

Data: 2026-03-09
Escopo: Fluxo de criacao e persistencia de BPMN em `/gerar-bpmn` e `/gerar-bpmn/criar`.

## 1. Testes Automatizados Executados

1. Build do frontend

- Comando: `npm run build`
- Resultado: PASSOU
- Evidencia: compilacao concluida, bundles gerados, `sw.js` gerado pelo PWA.

2. Lint do frontend

- Comando: `npm run lint`
- Resultado: PASSOU
- Evidencia: execucao sem erros reportados.

## 2. Matriz de Testes Funcionais (Manual)

### CT-01 - Acesso ao fluxo de criacao BPMN

- Pre-condicao: usuario autenticado com permissao de edicao.
- Passos:

1. Acessar `/gerar-bpmn`.
2. Clicar em `Criar BPMN`.

- Resultado esperado:

1. Navega para `/gerar-bpmn/criar`.
2. Editor abre sem erro.

- Resultado obtido: PENDENTE.

### CT-02 - Criacao de BPMN com nome e estrutura minima

- Pre-condicao: em `/gerar-bpmn/criar`.
- Passos:

1. Informar nome do processo.
2. Adicionar no minimo 1 no.
3. Clicar em `SALVAR`.

- Resultado esperado:

1. Salvamento concluido sem erro.
2. Feedback visual de sucesso.

- Resultado obtido: PENDENTE.

### CT-03 - Listagem do BPMN criado

- Pre-condicao: CT-02 concluido.
- Passos:

1. Voltar para `/gerar-bpmn`.
2. Procurar BPMN recem criado na tabela `BPMNs criados`.

- Resultado esperado:

1. Item aparece na tabela.
2. Dados de nome/status coerentes.

- Resultado obtido: PENDENTE.

### CT-04 - Edicao do BPMN criado

- Pre-condicao: CT-03 concluido.
- Passos:

1. No item criado, clicar em `Editar BPMN` (icone de lapis).
2. Alterar algo no fluxo.
3. Salvar novamente.

- Resultado esperado:

1. Editor abre o item correto.
2. Alteracoes persistem.

- Resultado obtido: PENDENTE.

### CT-05 - Abertura da oportunidade vinculada

- Pre-condicao: item existente na tabela de BPMN.
- Passos:

1. Clicar em `Ir para oportunidade` (icone de maleta).

- Resultado esperado:

1. Navega para `/oportunidades/:slug`.
2. Oportunidade correta e acessivel.

- Resultado obtido: PENDENTE.

### CT-06 - Atribuicao de responsavel em `/gerar-bpmn` (novo recurso)

- Pre-condicao: item existente em `BPMNs criados`.
- Passos:

1. Alterar `Atribuido a` para outro usuario.
2. Recarregar a pagina.

- Resultado esperado:

1. Valor selecionado persiste.
2. Campos de atribuicao atualizados na oportunidade.

- Resultado obtido: PENDENTE.

### CT-07 - Permissao (somente visualizacao)

- Pre-condicao: usuario nivel 1 (somente visualizacao).
- Passos:

1. Acessar `/gerar-bpmn`.
2. Tentar criar BPMN.
3. Tentar alterar `Atribuido a`.

- Resultado esperado:

1. Criacao bloqueada com aviso.
2. Select de atribuicao desabilitado.

- Resultado obtido: PENDENTE.

### CT-08 - Permissao (admin/dono/atribuido)

- Pre-condicao: usuario nivel 2/3, com diferentes cenarios de ownership.
- Passos:

1. Em itens onde usuario e admin, validar edicao de atribuicao.
2. Em itens onde usuario e dono/atribuido, validar edicao.
3. Em item sem ownership e sem admin, validar bloqueio.

- Resultado esperado:

1. Admin: permitido.
2. Dono/Atribuido: permitido.
3. Demais: bloqueado.

- Resultado obtido: PENDENTE.

## 3. Riscos e Observacoes

1. Nao existe script de teste automatizado funcional (ex.: `npm test`) no frontend atualmente.
2. Validacao funcional depende de execucao manual em ambiente com backend ativo.
3. Como o projeto usa PWA, recomenda-se repetir CT-01 a CT-04 com rede desconectada para verificar comportamento offline esperado do frontend.

## 4. Critérios de Aprovacao

1. CT-01 a CT-06: obrigatorios para aprovacao do fluxo de criacao BPMN.
2. CT-07 e CT-08: obrigatorios para aprovacao de seguranca/permissoes.
3. Sem erros de console bloqueantes durante os cenarios acima.
