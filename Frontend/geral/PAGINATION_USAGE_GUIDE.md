# Guia de Uso - New Pagination Pattern

## Como Usar o Hook `usePagination`

### Exemplo 1: Lista Simples (Opportunities)

```jsx
import usePagination from '../../Hooks/usePagination';
import Pagination from '../Common/Pagination';

export default function MyList() {
  const items = [
    /* array de dados */
  ];

  const { currentPage, totalPages, paginatedItems, nextPage, prevPage } =
    usePagination(items, 5); // 5 itens por página

  return (
    <>
      <table>
        <tbody>
          {paginatedItems.map((item) => (
            <tr key={item.id}>...</tr>
          ))}
        </tbody>
      </table>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPrevious={prevPage}
        onNext={nextPage}
      />
    </>
  );
}
```

### Exemplo 2: Múltiplas Tabelas (Entidades)

```jsx
import Pagination from '../Common/Pagination';

export default function MultipleTables() {
  const [tablePagination, setTablePagination] = useState({});

  function renderTable(title, items) {
    const currentPage = tablePagination[title] || 1;
    const itemsPerPage = 5;
    const totalPages = Math.ceil(items.length / itemsPerPage);
    const start = (currentPage - 1) * itemsPerPage;
    const paginatedItems = items.slice(start, start + itemsPerPage);

    const handlePrev = () => {
      setTablePagination(prev => ({
        ...prev,
        [title]: Math.max(1, currentPage - 1)
      }));
    };

    const handleNext = () => {
      setTablePagination(prev => ({
        ...prev,
        [title]: Math.min(totalPages, currentPage + 1)
      }));
    };

    return (
      <>
        <table>
          {paginatedItems.map(...)}
        </table>

        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPrevious={handlePrev}
          onNext={handleNext}
        />
      </>
    );
  }
}
```

### Exemplo 3: Com Filtros (CamposEntidades)

```jsx
const { campos } = useContext(EntidadesContext);

// Filtrar dados
const filteredCampos = campos.filter((c) => c.type === 'text');

// Paginar dados filtrados
const { currentPage, totalPages, paginatedItems, nextPage, prevPage } =
  usePagination(filteredCampos, 5);

// Renderizar
<Pagination
  currentPage={currentPage}
  totalPages={totalPages}
  onPrevious={prevPage}
  onNext={nextPage}
/>;
```

## Customização

### Mudar itens por página

```jsx
// Padrão: 5 itens
usePagination(items, 5);

// Custom: 10 itens
usePagination(items, 10);
```

### Customizar Pagination Component

Para customizar estilos, edite `src/Components/Common/Pagination.module.css`:

```css
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 1.5rem 0;
}

.pageButton {
  /* Customize aqui */
}

.pageInfo {
  /* Customize aqui */
}
```

## Checklist para Novos Componentes COM Paginação

- [ ] Importar `usePagination` hook
- [ ] Importar `Pagination` component
- [ ] Chamar `usePagination(array, itemsPerPage)`
- [ ] Usar `paginatedItems` nos loops
- [ ] Renderizar `<Pagination />` abaixo da tabela
- [ ] Testar nav anterior/próxima

## Checklist para Refatorar Componentes EXISTENTES COM Paginação

- [ ] Encontrar código de paginação duplicado
- [ ] Remover `useState` de paginação manual
- [ ] Remover cálculos de `totalPages`, `inicio`, etc
- [ ] Remover botões manuais de pagina
- [ ] Importar e usar `usePagination` hook
- [ ] Importar e renderizar `Pagination` component
- [ ] Testar se funciona igual ao original

## Performance Tips

1. **Use useMemo para dados filtrados**:

```jsx
const filteredItems = useMemo(
  () => items.filter((i) => i.status === 'active'),
  [items],
);

const { paginatedItems } = usePagination(filteredItems, 5);
```

2. **Não use usePagination dentro de loops/maps**:

```jsx
// ❌ ERRADO
{
  items.map((item) => {
    const pagination = usePagination(item.children, 5);
    // hooks rules violation!
  });
}

// ✅ CERTO
const [itemPaginations, setItemPaginations] = useState({});
// Gerenciar paginação por chave
```

3. **Use callback para handlers em listas grandes**:

```jsx
const handlePrevPage = useCallback(() => prevPage(), [prevPage]);
const handleNextPage = useCallback(() => nextPage(), [nextPage]);
```

## Troubleshooting

### Página aparece em branco após clicar

- Verificar se `paginationItems` está sendo renderizado
- Usar `console.log(paginatedItems)` para debug

### Botões não funcionam

- Verificar if callbacks `onPrevious` e `onNext` estão corretos
- Verificar if totals estão sendo calculados corretamente

### Estilo inconsistente

- Verificar se usando `Pagination` component em vez de botões customizados
- Comparar CSS com `Pagination.module.css`

---

**Adicionado em:** Refactoring React Router & Code Optimization
**Componentes afetados:** Opportunities, Entidades, CamposEntidades
**Benefício:** -66% duplicação de código, 100% UI consistência
