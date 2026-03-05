import React from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './CriarEntidades.module.css';
import Button from '../Forms/Button';
import useForm from '../../Hooks/useForm';
import { EntidadesContext } from '../../Context/EntidadesContext';
import { UserContext } from '../../Context/UserContext';
import { isReadOnlyAccessLevelOne } from '../../Utils/accessControl';

const CriarEntidades = () => {
  const navigate = useNavigate();
  const { adicionarEntidade, entidades, validarNomeEntidadeDuplicado } =
    React.useContext(EntidadesContext);
  const { user } = React.useContext(UserContext);
  const isReadOnlyMode = isReadOnlyAccessLevelOne(user);
  const [tabelaModo, setTabelaModo] = React.useState('nova');
  const nome = useForm();
  const [nomeTabela, setNomeTabela] = React.useState('');
  const [descricao, setDescricao] = React.useState('');
  const [tipoEntidade, setTipoEntidade] = React.useState('Apoio');
  const [formError, setFormError] = React.useState('');

  const tabelasDisponiveis = React.useMemo(
    () =>
      Array.from(
        new Set(
          (Array.isArray(entidades) ? entidades : [])
            .map((entidade) => String(entidade?.categoria || '').trim())
            .filter(Boolean),
        ),
      ),
    [entidades],
  );
  const hasTabelas = tabelasDisponiveis.length > 0;

  React.useEffect(() => {
    if (hasTabelas) {
      setTabelaModo((prev) => (prev === 'existente' ? prev : 'nova'));
      return;
    }

    setTabelaModo('nova');
  }, [hasTabelas]);

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError('');

    if (isReadOnlyMode) {
      setFormError('Seu nível de acesso permite apenas visualização.');
      return;
    }

    if (nome.validate() && String(descricao || '').trim()) {
      if (validarNomeEntidadeDuplicado(nome.value)) {
        setFormError('Já existe uma entidade com esse nome.');
        return;
      }

      const novaEntidade = {
        nome: nome.value,
        descricao,
        categoria: String(nomeTabela || '').trim() || 'Manual',
        tipoEntidade,
        criadoPor: user?.nome || user?.username || 'Usuário',
        campos: [],
      };

      const token = window.localStorage.getItem('token');
      try {
        await adicionarEntidade(novaEntidade, token);
        navigate('/entidades');
      } catch (error) {
        setFormError(error?.message || 'Não foi possível criar a entidade.');
      }
    }
  }

  return (
    <section className={styles.container}>
      <h1 className={styles.title}>Criar Entidade</h1>
      {isReadOnlyMode ? (
        <p className={styles.error}>
          Seu usuário está em modo somente visualização e não pode criar
          entidades.
        </p>
      ) : null}

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label htmlFor="nomeTabela" className={styles.label}>
            Nome da tabela
          </label>
          <div className={styles.tableOptions}>
            <label className={styles.optionLabel}>
              <input
                type="radio"
                name="tabelaModo"
                value="existente"
                checked={tabelaModo === 'existente'}
                onChange={(event) => setTabelaModo(event.target.value)}
                disabled={!hasTabelas || isReadOnlyMode}
              />
              Usar existente
            </label>
            <label className={styles.optionLabel}>
              <input
                type="radio"
                name="tabelaModo"
                value="nova"
                checked={tabelaModo === 'nova'}
                onChange={(event) => setTabelaModo(event.target.value)}
                disabled={isReadOnlyMode}
              />
              Criar nova
            </label>
          </div>

          {tabelaModo === 'existente' && hasTabelas ? (
            <select
              id="nomeTabela"
              name="nomeTabela"
              className={styles.select}
              value={nomeTabela}
              onChange={(event) => setNomeTabela(event.target.value)}
              disabled={isReadOnlyMode}
            >
              <option value="" disabled>
                Selecione uma tabela...
              </option>
              {tabelasDisponiveis.map((tabelaExistente) => (
                <option key={tabelaExistente} value={tabelaExistente}>
                  {tabelaExistente}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="nomeTabela"
              type="text"
              name="nomeTabela"
              className={styles.input}
              value={nomeTabela}
              onChange={(event) => setNomeTabela(event.target.value)}
              disabled={isReadOnlyMode}
              placeholder="Ex: Clientes, Pedidos, Contratos..."
            />
          )}
        </div>

        <div className={styles.field}>
          <label htmlFor="nome" className={styles.label}>
            Nome de entidade
          </label>
          <input
            id="nome"
            type="text"
            name="nome"
            className={styles.input}
            value={nome.value}
            onChange={nome.onChange}
            onBlur={nome.onBlur}
            disabled={isReadOnlyMode}
            placeholder="Escreva o nome da entidade que será exibido"
          />
          {nome.error && <span className={styles.error}>{nome.error}</span>}
        </div>

        <div className={styles.field}>
          <label htmlFor="descricao" className={styles.label}>
            Descrição
          </label>
          <textarea
            id="descricao"
            className={styles.textarea}
            placeholder="Escreva a descrição da entidade..."
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            disabled={isReadOnlyMode}
            rows={6}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="tipoEntidade" className={styles.label}>
            Tipo de entidade
          </label>
          <select
            id="tipoEntidade"
            name="tipoEntidade"
            className={styles.select}
            value={tipoEntidade}
            onChange={(event) => setTipoEntidade(event.target.value)}
            disabled={isReadOnlyMode}
          >
            <option value="Principal">Principal</option>
            <option value="Apoio">Apoio</option>
            <option value="Associativa">Associativa</option>
            <option value="Externa">Externa</option>
          </select>
        </div>
        <Button className={styles.button} disabled={isReadOnlyMode}>
          Criar
        </Button>
        {formError && <p className={styles.error}>{formError}</p>}
      </form>
    </section>
  );
};

export default CriarEntidades;
