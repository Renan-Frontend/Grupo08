# 🎯 EditablePipeline - Componente Interativo de Pipeline Editável

## 📋 Visão Geral

O componente `EditablePipeline` transforma o SVG estático `regua.svg` em um **pipeline completamente interativo e editável** para gerenciamento de etapas de vendas (ou qualquer outro processo com múltiplas etapas).

## ✨ Funcionalidades

### 1. **Visualização Interativa**

- Exibe etapas em um layout horizontal com conexões visuais
- Indicadores circulares com status de conclusão (OK ou vazio)
- Labels editáveis para cada etapa

### 2. **Edição de Etapas**

- **Clicar** no nome da etapa para editar
- **Double-click** também ativa o modo de edição
- **Enter** para salvar | **Escape** para cancelar

### 3. **Marcar como Concluído**

- **Clicar no círculo** de status para alternar entre concluído/não concluído
- Animação visual quando o status muda
- Cores dinâmicas (verde = concluído, cinza = não concluído)

### 4. **Ações por Etapa**

- **Botão ✎** - Editar nome da etapa (aparece ao passar o mouse)
- **Botão ✕** - Remover etapa (desabilitado se for a última etapa)
- **Botão +** - Adicionar nova etapa ao final

### 5. **Adicionar Novas Etapas**

- Clicar no botão **+** para criar uma nova etapa
- Input com campo de texto para nome da nova etapa
- Confirmar com **✓** ou cancelar com **✕**

### 6. **Salvar Alterações**

- Botão "Salvar Pipeline" na barra inferior
- Callback `onSave` para persistir mudanças no backend

## 🔧 Como Usar

### Importação

```jsx
import EditablePipeline from './Components/Opportunities/EditablePipeline';
```

### Uso Básico

```jsx
<EditablePipeline
  initialStages={[
    { id: 1, label: 'Qualificar', done: true },
    { id: 2, label: 'Desenvolver', done: true },
    { id: 3, label: Finalizado', done: false },
  ]}
  onSave={(updatedStages) => {
    // Salvar no banco de dados
    console.log('Pipeline atualizado:', updatedStages);
  }}
  title="Oportunidade de Processo de Vendas"
  subtitle="Completo em 18 meses"
/>
```

### Props

| Prop            | Tipo     | Padrão                                 | Descrição                                    |
| --------------- | -------- | -------------------------------------- | -------------------------------------------- |
| `initialStages` | Array    | `[]`                                   | Etapas iniciais do pipeline                  |
| `onSave`        | Function | `null`                                 | Callback chamado ao clicar "Salvar Pipeline" |
| `title`         | String   | `'Oportunidade de Processo de Vendas'` | Título do pipeline                           |
| `subtitle`      | String   | `'Completo em 18 meses'`               | Subtítulo/descrição                          |

### Estrutura de Stage

```javascript
{
  id: 1,              // Identificador único (número)
  label: 'Qualificar',  // Nome da etapa
  done: true          // Status de conclusão (boolean)
}
```

## 🎨 Estilos

O componente usa **CSS Modules** (`EditablePipeline.module.css`) e é totalmente estilizável. Classes principais:

- `.pipelineContainer` - Container geral
- `.pipelineRow` - Linha principal
- `.pipelineBadge` - Badge com informações
- `.pipelineTrack` - Trilha com as etapas
- `.stage` - Etapa individual
- `.stageDot` - Círculo de status
- `.stageLabel` - Nome da etapa

## 🎭 Exemplos de Uso Avançado

### Exemplo 1: Pipeline sem Botão Salvar

```jsx
<EditablePipeline initialStages={stages} title="Processo de Onboarding" />
```

### Exemplo 2: Com Persistência em Backend

```jsx
const [stages, setStages] = useState(initialStages);

const handleSavePipeline = async (updatedStages) => {
  try {
    const response = await fetch(`/api/opportunities/${id}/pipeline`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stages: updatedStages }),
    });
    if (response.ok) {
      alert('Pipeline salvo com sucesso!');
    }
  } catch (error) {
    console.error('Erro ao salvar:', error);
  }
};

<EditablePipeline initialStages={stages} onSave={handleSavePipeline} />;
```

### Exemplo 3: Integração com Estado Global (Redux/Context)

```jsx
const { stages, updatePipeline } = useContext(OpportunitiesContext);

<EditablePipeline
  initialStages={stages}
  onSave={(newStages) => {
    updatePipeline(opportunityId, newStages);
  }}
/>;
```

## 📱 Responsividade

O componente é **totalmente responsivo**:

- **Desktop (768px+)**: Layout horizontal completo
- **Mobile (<768px)**: Layout adaptado com etapas em coluna
- Linhas de conexão ocultadas em mobile
- Botões de ação sempre acessíveis

## 🔄 Fluxo de Interação

```
1. Usuário clica em nome da etapa
   ↓
2. Campo de input aparece
   ↓
3. Edita o texto
   ↓
4. Pressiona Enter ou clica fora
   ↓
5. Mudança é salva no estado local
   ↓
6. Usuário clica "Salvar Pipeline"
   ↓
7. Callback onSave é disparado
```

## 🎯 Casos de Uso

1. **Opportunities/Buscas de Vendas**
   - Gerenciar etapas do processo de vendas
   - Rastrear progresso de negociações

2. **Projetos**
   - Definir e acompanhar fases de projeto
   - Documentar marcos importantes

3. **Onboarding**
   - Criar fluxo de integração de clientes
   - Etapas de configuração inicial

4. **Workflows Customizados**
   - Qualquer processo que tenha múltiplas etapas sequenciais

## 🐛 Troubleshooting

### Etapas não aparecem

- Verifique se `initialStages` está corretamente formatado
- Cada stage deve ter `id`, `label` e `done`

### Blur/Focus issues

- O componente é responsivo a Enter, Escape e blur automático
- Verificar se há conflito com outros listeners de teclado

### Salvar não funciona

- Certifique-se de que `onSave` é uma função válida
- Verifique o console para erros

## 📝 Integração Current

O componente está **integrado em**:

- `OpportunityDetail.jsx` - Exibindo etapas do pipeline de vendas
- Estado local gerenciado com `useState`
- Pronto para conectar a uma API de persistência

## 🚀 Próximas Melhorias (Sugestões)

- [ ] Drag-and-drop para reordenar etapas
- [ ] Cores customizáveis por etapa
- [ ] Datas de deadline para cada etapa
- [ ] Histórico de mudanças/timeline
- [ ] Integração com notificações
- [ ] Temas customizáveis (light/dark)
- [ ] Multi-language support

## 📄 Licença

Parte do projeto BP-COMPANY-VERSAO2

---

**Última atualização**: Fevereiro 2026
**Status**: ✅ Produção
