# ✅ Checklist de Validação - EditablePipeline

## Instruções de Teste

Siga este checklist para validar que o componente `EditablePipeline` está funcionando corretamente.

---

## 🚀 Setup Inicial

### 1. Verificar Arquivos Criados

- [ ] `src/Components/Opportunities/EditablePipeline.jsx` existe
- [ ] `src/Components/Opportunities/EditablePipeline.module.css` existe
- [ ] `OpportunityDetail.jsx` foi atualizado com o novo componente

### 2. Iniciar Servidor

```bash
cd d:\Program Files\Programacao\BP-COMPANY-VERSAO2
npm run dev
```

- [ ] Servidor iniciou em `http://localhost:5173` ou `http://localhost:5174`
- [ ] Nenhum erro de compilação no console

### 3. Navegar para a Página

- [ ] Abrir `http://localhost:5173` (ou a porta usada)
- [ ] Navegar para uma oportunidade que exiba o pipeline
- [ ] Pipeline renderiza sem erros

---

## 🎯 Testes Funcionais

### ✏️ Teste 1: Editar Nome de Etapa

**Pré-requisitos**: Pipeline visível na tela

**Passos**:

1. [ ] Clicar no nome de uma etapa (ex: "Qualificar")
2. [ ] Campo de input deve aparecer
3. [ ] Texto original deve estar selecionado ou visível
4. [ ] Digitar novo nome (ex: "Prospecção")
5. [ ] Pressionar **Enter**
6. [ ] Nome deve atualizar na tela
7. [ ] Input deve desaparecer

**Teste Alternativo - Double Click**:

1. [ ] Double-click no nome da etapa
2. [ ] Deve ativar modo de edição
3. [ ] Seguir passos 3-7 acima

**Teste Alternativo - Escape para Cancelar**:

1. [ ] Clicar no nome da etapa
2. [ ] Digitar novo texto
3. [ ] Pressionar **Escape**
4. [ ] Nome original deve ser mantido
5. [ ] Input deve desaparecer

---

### ✅ Teste 2: Toggle Status de Conclusão

**Passos**:

1. [ ] Clicar no círculo de status de uma etapa incompleta
2. [ ] Círculo deve ficar **verde** (#2fb36d)
3. [ ] **✓** (checkmark) deve aparecer dentro do círculo
4. [ ] Clicar novamente no círculo
5. [ ] Círculo deve voltar ao **cinza**
6. [ ] Checkmark deve desaparecer

**Estados Visuais**:

- [ ] "Qualificar" (concluído) = círculo verde com ✓
- [ ] "Desenvolver" (concluído) = círculo verde com ✓
- [ ] "Finalizado" (não concluído) = círculo cinza vazio

---

### ➕ Teste 3: Adicionar Nova Etapa

**Passos**:

1. [ ] Procurar pelo botão **+** ao lado das etapas
2. [ ] Clicar no botão **+**
3. [ ] Formulário inline deve aparecer com:
   - [ ] Campo de input para nome
   - [ ] Botão **✓** (confirmar)
   - [ ] Botão **✕** (cancelar)
4. [ ] Digitar nome (ex: "Remover BPF")
5. [ ] Pressionar **Enter** OU clicar **✓**
6. [ ] Nova etapa deve aparecer no final do pipeline
7. [ ] Formulário deve desaparecer
8. [ ] Botão **+** deve reaparecer

**Teste - Cancelar**:

1. [ ] Clicar **+** novamente
2. [ ] Digitar um nome
3. [ ] Pressionar **Escape** OU clicar **✕**
4. [ ] Formulário deve desaparecer
5. [ ] Nenhuma etapa deve ser adicionada

---

### 🗑️ Teste 4: Remover Etapa

**Pré-requisitos**: Ter pelo menos 2 etapas

**Passos**:

1. [ ] Passar mouse sobre uma etapa
2. [ ] Botões devem aparecer abaixo da etapa:
   - [ ] Botão **✎** (editar)
   - [ ] Botão **✕** (remover, se não for a última)
3. [ ] Clicar em **✕**
4. [ ] Etapa deve ser removida do pipeline
5. [ ] Total de etapas deve diminuir em 1

**Teste - Última Etapa**:

1. [ ] Remover todas as etapas exceto uma
2. [ ] Clicar na última etapa
3. [ ] Botão **✕** deve estar **desabilitado** (não aparecer)
4. [ ] Mensagem ou tooltip pode aparecer
5. [ ] Não deve ser possível remover a última etapa

---

### 💾 Teste 5: Botão Salvar Pipeline

**Passos**:

1. [ ] Fazer algumas alterações (editar, adicionar, remover etapas)
2. [ ] Procurar pelo botão **"Salvar Pipeline"** na barra inferior
3. [ ] Clicar no botão
4. [ ] Callback deve ser disparado
5. [ ] Verificar no console se as alterações foram capturadas:
   ```
   console.log('Stages:', stages);
   ```

---

## 🎨 Testes de Estilo

### Visual

**Desktop (>768px)**:

- [ ] Pipeline renderiza horizontalmente
- [ ] Linhas de conexão aparecem entre etapas
- [ ] Botões aparecem ao passar mouse
- [ ] Layout é espaçado e limpo
- [ ] Cores estão corretas:
  - [ ] Fundo: cinza claro (#fafafa)
  - [ ] Sucesso: verde (#2fb36d)
  - [ ] Perigo: vermelho (#dd2727)

**Mobile (<768px)**:

- [ ] Pipeline se adapta a tela menor
- [ ] Linhas de conexão desaparecem
- [ ] Etapas se alinham melhor para tela pequena
- [ ] Botões permanecem acessíveis
- [ ] Sem scroll horizontal forçado

---

## ⌨️ Testes de Navegação (Keyboard)

- [ ] **Tab**: Navegar entre elementos
- [ ] **Enter**: Salvar edição ou confirmar ação
- [ ] **Escape**: Cancelar edição
- [ ] **Space**: Ativar botões (em alguns casos)

---

## 🐛 Testes de Edge Cases

### Edição

- [ ] [ ] Editar para nome vazio: Deve manter nome original
- [ ] [ ] Editar com espaços em branco: Deve trimpar
- [ ] [ ] Editar com caracteres especiais: Deve aceitar
- [ ] [ ] Editar com muito texto: Deve limitar ou quebrar linha

### Adição

- [ ] [ ] Adicionar com nome vazio: Não deve criar etapa
- [ ] [ ] Adicionar múltiplas rapidamente: Deve funcionar
- [ ] [ ] Adicionar com nomes duplicados: Deve permitir (para discussão)

### Remoção

- [ ] [ ] Remover e depois desfazer: Estado volta?
- [ ] [ ] Remover todas exceto uma: Última fica protegida?

---

## 📊 Testes de Performance

- [ ] [ ] Com 5 etapas: Sem lag
- [ ] [ ] Com 20 etapas: Sem lag notável
- [ ] [ ] Com 50+ etapas: Monitor performance (possível lag)

**Como testar**:

```jsx
const manyStages = Array.from({ length: 50 }, (_, i) => ({
  id: i + 1,
  label: `Stage ${i + 1}`,
  done: Math.random() > 0.5,
}));

<EditablePipeline initialStages={manyStages} />;
```

---

## 🔗 Testes de Integração

### Com OpportunityDetail

- [ ] [ ] Pipeline aparece corretamente em OpportunityDetail
- [ ] [ ] Estado de stages se atualiza quando editado
- [ ] [ ] Dados persistem durante navegação (sessão)
- [ ] [ ] Integração com outros componentes da página

### Com API (se implementado)

- [ ] [ ] Clique em "Salvar" dispara requisição HTTP
- [ ] [ ] Dados corretos são enviados para backend
- [ ] [ ] Resposta é processada corretamente
- [ ] [ ] Erros de rede são tratados

---

## 🌍 Testes de Responsividade

### Desktop (1920x1080)

- [ ] [ ] Todos os elementos visíveis
- [ ] [ ] Layout horizontal perfeito
- [ ] [ ] Sem overflow horizontal

### Tablet (768x1024)

- [ ] [ ] Adapta bem ao tamanho
- [ ] [ ] Elementos acessíveis com toque
- [ ] [ ] Sem scroll excessivo

### Mobile (375x667)

- [ ] [ ] Elementos se reorganizam
- [ ] [ ] Toque nos botões funciona
- [ ] [ ] Inputs são acessíveis
- [ ] [ ] Sem scroll horizontal

---

## 🎭 Testes de Acessibilidade

- [ ] [ ] Navegação completa com **Tab**
- [ ] [ ] Inputs têm **focus** visível
- [ ] [ ] Botões têm **title** ou **aria-label**
- [ ] [ ] Cores contrastam bem (WCAG AA)
- [ ] [ ] Sem erros no console de acessibilidade

---

## 📋 Relatório Final

### Problemas Encontrados

**Teste**: ********\_\_\_********  
**Resultado**: [ ] Passou [ ] Falhou  
**Descrição**: **********************\_**********************

**Teste**: ********\_\_\_********  
**Resultado**: [ ] Passou [ ] Falhou  
**Descrição**: **********************\_**********************

---

### Resumo

Total de Testes: \_**\_  
Testes Aprovados: \_\_**  
Taxa de Sucesso: \_\_\_\_%

**Status Geral**:

- [ ] ✅ PRONTO PARA PRODUÇÃO
- [ ] ⚠️ ALGUMAS CORREÇÕES NECESSÁRIAS
- [ ] ❌ NECESSITA REVISÃO COMPLETA

---

## 🚀 Próximas Ações

1. [ ] Documentação revisada pelo usuário
2. [ ] Testes de aceitação aprovados
3. [ ] Preparado para deploy em produção
4. [ ] Monitoramento em produção ativo

---

**Data de Teste**: ******\_\_******  
**Testador**: ******\_\_******  
**Assinatura**: ******\_\_******

---

Para qualquer dúvida, consulte:

- `EDITABLE_PIPELINE_GUIDE.md`
- `EDITABLE_PIPELINE_FAQ.md`
- `EditablePipeline.examples.jsx`
