# ❓ FAQ - EditablePipeline Component

## Perguntas Frequentes

### **P1: Como começo a usar o EditablePipeline?**

**R:** Importe o componente e passe as props:

```jsx
import EditablePipeline from './Components/Opportunities/EditablePipeline';

<EditablePipeline
  initialStages={[
    { id: 1, label: 'Stage 1', done: false },
    { id: 2, label: 'Stage 2', done: false },
  ]}
/>;
```

---

### **P2: Como salvar as alterações no banco de dados?**

**R:** Use a prop `onSave` com uma função que chame sua API:

```jsx
const handleSaveToDatabase = async (updatedStages) => {
  try {
    const response = await fetch(`/api/opportunities/${id}/pipeline`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stages: updatedStages }),
    });
    if (response.ok) {
      console.log('Salvo com sucesso!');
    }
  } catch (error) {
    console.error('Erro ao salvar:', error);
  }
};

<EditablePipeline initialStages={stages} onSave={handleSaveToDatabase} />;
```

---

### **P3: Posso customizar as cores?**

**R:** Sim! Edite o arquivo `EditablePipeline.module.css`. Encontre e altere as cores:

```css
.stageDot {
  border: 2px solid #2fb36d; /* Cor principal */
}

.stage[data-done='true'] .stageDot {
  background: #2fb36d; /* Cor de sucesso */
}

.linkButton {
  color: #2fb36d; /* Cor do botão */
}
```

Ou crie classes customizadas:

```css
.pipelineContainer.dark-theme {
  background: #1a1a1a;
  color: white;
}
```

---

### **P4: Como reordenar as etapas (drag and drop)?**

**R:** No momento, não há drag-and-drop nativo. Você pode implementar usando `react-beautiful-dnd`:

```jsx
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';

const onDragEnd = (result) => {
  const { source, destination } = result;
  if (!destination) return;

  const newStages = Array.from(stages);
  const [movedStage] = newStages.splice(source.index, 1);
  newStages.splice(destination.index, 0, movedStage);

  setStages(newStages);
};
```

---

### **P5: Posso ter etapas com cores diferentes?**

**R:** Sim! Estenda a estrutura de `stage`:

```jsx
const stages = [
  { id: 1, label: 'Start', done: true, color: '#2fb36d' },
  { id: 2, label: 'Processing', done: false, color: '#ff9800' },
  { id: 3, label: 'Critical', done: false, color: '#dd2727' },
];
```

Depois, modifique o CSS:

```jsx
<button
  className={styles.stageDot}
  style={{
    borderColor: stage.color,
    backgroundColor: stage.done ? stage.color : '#cfd6dc',
  }}
/>
```

---

### **P6: Como adicionar ícones para cada etapa?**

**R:** Estenda a estrutura e renderize ícones:

```jsx
const stages = [
  { id: 1, label: 'Prospecting', done: true, icon: '🔍' },
  { id: 2, label: 'Negotiation', done: false, icon: '💬' },
  { id: 3, label: 'Closed', done: false, icon: '✅' },
];

// No componente:
<span>
  {stage.icon} {stage.label}
</span>;
```

---

### **P7: Como adicionar datas de deadline para cada etapa?**

**R:** Estenda a estrutura com datas:

```jsx
const stages = [
  { id: 1, label: 'Phase 1', done: true, deadline: '2026-01-31' },
  { id: 2, label: 'Phase 2', done: false, deadline: '2026-02-28' },
];

// No template JSX:
<div>
  <span>{stage.label}</span>
  {stage.deadline && (
    <small style={{ color: '#999' }}>
      Due: {new Date(stage.deadline).toLocaleDateString()}
    </small>
  )}
</div>;
```

---

### **P8: Posso desabilitar a edição?**

**R:** Crie uma versão read-only ou passe uma prop:

```jsx
const EditablePipelineReadOnly = ({ initialStages, ...props }) => {
  return (
    <div className={styles.pipelineContainer}>
      {/* Renderizar stages sem botões de edição */}
      {initialStages.map((stage) => (
        <div key={stage.id} className={styles.stage}>
          <div className={styles.stageDot}>{stage.done ? '✓' : ''}</div>
          <span className={styles.stageLabel}>{stage.label}</span>
        </div>
      ))}
    </div>
  );
};
```

---

### **P9: Como validar que nomes não se repetem?**

**R:** Adicione validação no callback:

```jsx
const handleSave = (updatedStages) => {
  const labels = updatedStages.map((s) => s.label);
  const uniqueLabels = new Set(labels);

  if (labels.length !== uniqueLabels.size) {
    alert('Nomes de etapa duplicados não são permitidos!');
    return;
  }

  // Continuar com salvamento
  saveToDatabase(updatedStages);
};

<EditablePipeline initialStages={stages} onSave={handleSave} />;
```

---

### **P10: Como usar em Dark Mode?**

**R:** Crie classes CSS para dark mode:

```css
/* EditablePipeline.module.css */
.pipelineContainer.dark-mode {
  --color-primary: #2fb36d;
  --color-bg: #1a1a1a;
  --color-text: #e0e0e0;
  --color-border: #333;
}

.pipelineContainer.dark-mode .pipelineRow {
  background: var(--color-bg);
  border-color: var(--color-border);
  color: var(--color-text);
}
```

E use:

```jsx
<EditablePipeline
  initialStages={stages}
  onSave={setStages}
  className={darkMode ? 'dark-mode' : ''}
/>
```

---

### **P11: Como rastrear histórico de mudanças?**

**R:** Implemente um sistema de versioning:

```jsx
const [history, setHistory] = useState([]);

const handleSave = (updatedStages) => {
  const timestamp = new Date().toISOString();
  setHistory([
    ...history,
    {
      timestamp,
      stages: updatedStages,
      user: currentUser.name,
    },
  ]);

  // Salvar no backend
  saveToDatabase(updatedStages);
};
```

---

### **P12: Como integrar com Redux?**

**R:** Use Redux para estado global:

```jsx
// Actions
export const updatePipeline = (opportunityId, stages) => ({
  type: 'UPDATE_PIPELINE',
  payload: { opportunityId, stages },
});

// Component
import { useDispatch, useSelector } from 'react-redux';

const OpportunityDetail = () => {
  const dispatch = useDispatch();
  const stages = useSelector((state) => state.opportunities.stages);

  const handleSave = (updatedStages) => {
    dispatch(updatePipeline(opportunityId, updatedStages));
  };

  return <EditablePipeline initialStages={stages} onSave={handleSave} />;
};
```

---

### **P13: Como adicionar notificações ao salvar?**

**R:** Use uma biblioteca como `react-toastify`:

```jsx
import { toast } from 'react-toastify';

const handleSave = async (updatedStages) => {
  try {
    await fetch(`/api/pipeline/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ stages: updatedStages }),
    });
    toast.success('Pipeline salvo com sucesso! ✓');
  } catch (error) {
    toast.error('Erro ao salvar pipeline ✗');
  }
};
```

---

### **P14: Como exportar o pipeline como PDF/CSV?**

**R:** Implemente uma função de exportação:

```jsx
const exportToPDF = (stages) => {
  const content = stages
    .map(
      (s, i) => `${i + 1}. ${s.label} - ${s.done ? 'Concluído' : 'Pendente'}`,
    )
    .join('\n');

  const element = document.createElement('a');
  element.setAttribute(
    'href',
    'data:text/plain;charset=utf-8,' + encodeURIComponent(content),
  );
  element.setAttribute('download', 'pipeline.txt');
  element.click();
};

const exportToCSV = (stages) => {
  const csv =
    'Etapa,Status\n' +
    stages
      .map((s) => `${s.label},"${s.done ? 'Concluído' : 'Pendente'}"`)
      .join('\n');

  const element = document.createElement('a');
  element.setAttribute(
    'href',
    'data:text/csv;charset=utf-8,' + encodeURIComponent(csv),
  );
  element.setAttribute('download', 'pipeline.csv');
  element.click();
};
```

---

### **P15: Performance - Como usar com 100+ etapas?**

**R:** Use virtualization com `react-window`:

```jsx
import { FixedSizeList } from 'react-window';

const VirtualizedPipeline = ({ stages }) => (
  <FixedSizeList
    height={600}
    itemCount={stages.length}
    itemSize={35}
    width="100%"
  >
    {({ index, style }) => <div style={style}>{/* Renderizar stage */}</div>}
  </FixedSizeList>
);
```

---

### **P16: Como testar o componente?**

**R:** Use Jest e React Testing Library:

```jsx
import { render, screen, fireEvent } from '@testing-library/react';
import EditablePipeline from './EditablePipeline';

test('renders stages correctly', () => {
  const stages = [{ id: 1, label: 'Test', done: false }];
  render(<EditablePipeline initialStages={stages} />);
  expect(screen.getByText('Test')).toBeInTheDocument();
});

test('edits stage name on click', () => {
  const stages = [{ id: 1, label: 'Original', done: false }];
  render(<EditablePipeline initialStages={stages} />);
  fireEvent.click(screen.getByText('Original'));
  // ... assertions
});
```

---

### **P17: Qual é o tamanho do bundle?**

**R:** O componente é bem leve:

- `EditablePipeline.jsx`: ~4kb (minified)
- `EditablePipeline.module.css`: ~8kb (minified)
- **Total**: ~12kb (sem dependências externas)

---

### **P18: Suporta internacionalização (i18n)?**

**R:** Sim! Use com sua solução i18n:

```jsx
import { useTranslation } from 'react-i18next';

const EditablePipelineI18n = (props) => {
  const { t } = useTranslation();

  return (
    <EditablePipeline
      {...props}
      title={t('pipeline.title')}
      subtitle={t('pipeline.subtitle')}
    />
  );
};
```

---

### **P19: Como implementar undo/redo?**

**R:** Use o padrão Command com histórico:

```jsx
const [stages, setStages] = useState(initialStages);
const [history, setHistory] = useState([initialStages]);
const [historyIndex, setHistoryIndex] = useState(0);

const handleStageChange = (newStages) => {
  const newHistory = history.slice(0, historyIndex + 1);
  setStages(newStages);
  setHistory([...newHistory, newStages]);
  setHistoryIndex(newHistory.length);
};

const undo = () => {
  if (historyIndex > 0) {
    setHistoryIndex(historyIndex - 1);
    setStages(history[historyIndex - 1]);
  }
};

const redo = () => {
  if (historyIndex < history.length - 1) {
    setHistoryIndex(historyIndex + 1);
    setStages(history[historyIndex + 1]);
  }
};
```

---

### **P20: Posso usar com TypeScript?**

**R:** Sim! Crie tipos:

```typescript
// EditablePipeline.d.ts
interface Stage {
  id: number;
  label: string;
  done: boolean;
}

interface EditablePipelineProps {
  initialStages?: Stage[];
  onSave?: (stages: Stage[]) => void;
  title?: string;
  subtitle?: string;
}

declare const EditablePipeline: React.FC<EditablePipelineProps>;
export default EditablePipeline;
```

---

## 🆘 Problemas Comuns

### **Problema: Edição não funciona**

**Solução**: Verificar se o estado está sendo passado corretamente e se o callback `onSave` está implementado.

### **Problema: Estilos não aparecem**

**Solução**: Verificar se o CSS Module está sendo importado corretamente: `import styles from './EditablePipeline.module.css'`

### **Problema: Componente está lento**

**Solução**: Se há muitas etapas (100+), use `useMemo` ou virtualization.

### **Problema: Mudanças não persistem ao recarregar**

**Solução**: Implementar callback `onSave` com chamada API para salvar no servidor.

---

## 📞 Suporte

Para mais dúvidas, consulte:

- `EDITABLE_PIPELINE_GUIDE.md` - Documentação completa
- `EditablePipeline.examples.jsx` - Exemplos práticos
- Código comentado em `EditablePipeline.jsx`

---

**Last Updated**: Fevereiro 2026
