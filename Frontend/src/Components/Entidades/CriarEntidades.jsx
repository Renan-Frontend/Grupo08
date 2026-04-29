import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import styles from "./CriarEntidades.module.css";
import Button from "../Forms/Button";
import useForm from "../../Hooks/useForm";
import { EntidadesContext } from "../../Context/EntidadesContext";
import { UserContext } from "../../Context/UserContext";
import { isReadOnlyAccessLevelOne } from "../../Utils/accessControl";

const CriarEntidades = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    adicionarEntidade,
    editarEntidade,
    entidades,
    validarNomeEntidadeDuplicado,
  } = React.useContext(EntidadesContext);
  const { user } = React.useContext(UserContext);
  const isReadOnlyMode = isReadOnlyAccessLevelOne(user);
  const [tabelaModo, setTabelaModo] = React.useState("nova");
  const nome = useForm();
  const [nomeTabela, setNomeTabela] = React.useState("");
  const [descricao, setDescricao] = React.useState("");
  const [tipoEntidade, setTipoEntidade] = React.useState("Processo");
  const [papelNegocio, setPapelNegocio] = React.useState("");
  const [formError, setFormError] = React.useState("");
  const entityIdFromQuery = React.useMemo(() => {
    const params = new URLSearchParams(location.search || "");
    const value = String(params.get("entidadeId") || "").trim();
    return value || null;
  }, [location.search]);

  const papelNegocioFromQuery = React.useMemo(() => {
    const params = new URLSearchParams(location.search || "");
    return (
      String(params.get("papelNegocio") || "")
        .trim()
        .toLowerCase() || null
    );
  }, [location.search]);

  const entidadeEmEdicao = React.useMemo(() => {
    if (!entityIdFromQuery) return null;

    return (
      (Array.isArray(entidades) ? entidades : []).find(
        (entidade) =>
          String(entidade?.id ?? entidade?._id ?? "") === entityIdFromQuery,
      ) || null
    );
  }, [entidades, entityIdFromQuery]);

  const isEditingMode = Boolean(entidadeEmEdicao && entityIdFromQuery);

  React.useEffect(() => {
    if (!isEditingMode && papelNegocioFromQuery) {
      setPapelNegocio(papelNegocioFromQuery);
      if (papelNegocioFromQuery === "contato") setTipoEntidade("Contato");
      if (papelNegocioFromQuery === "processo") setTipoEntidade("Processo");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [papelNegocioFromQuery]);

  const tabelasDisponiveis = React.useMemo(
    () =>
      Array.from(
        new Set(
          (Array.isArray(entidades) ? entidades : [])
            .map((entidade) => String(entidade?.categoria || "").trim())
            .filter(Boolean),
        ),
      ),
    [entidades],
  );
  const hasTabelas = tabelasDisponiveis.length > 0;

  React.useEffect(() => {
    if (hasTabelas) {
      setTabelaModo((prev) => (prev === "existente" ? prev : "nova"));
      return;
    }

    setTabelaModo("nova");
  }, [hasTabelas]);

  React.useEffect(() => {
    if (!entidadeEmEdicao) return;

    const categoriaAtual = String(entidadeEmEdicao?.categoria || "").trim();
    const categoriaExiste = tabelasDisponiveis.some(
      (item) => String(item || "").trim() === categoriaAtual,
    );

    nome.setValue(String(entidadeEmEdicao?.nome || ""));
    setDescricao(String(entidadeEmEdicao?.descricao || ""));
    setTipoEntidade(String(entidadeEmEdicao?.tipoEntidade || "Processo"));
    setPapelNegocio(String(entidadeEmEdicao?.papelNegocio || ""));
    setNomeTabela(categoriaAtual);
    setTabelaModo(categoriaExiste ? "existente" : "nova");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entidadeEmEdicao, tabelasDisponiveis]);

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError("");

    if (isReadOnlyMode) {
      setFormError("Seu nível de acesso permite apenas visualização.");
      return;
    }

    const nomeValido = nome.validate();
    const descValida = String(descricao || "").trim();
    if (!nomeValido || !descValida) {
      if (!descValida) setFormError("A descrição é obrigatória.");
      return;
    }

    const categoriaDestino = String(nomeTabela || "").trim() || "Manual";
    const ignoreId = entidadeEmEdicao?.id ?? entidadeEmEdicao?._id ?? null;

    if (validarNomeEntidadeDuplicado(nome.value, ignoreId, categoriaDestino)) {
      setFormError("Já existe uma entidade com esse nome nesta tabela.");
      return;
    }

    const novaEntidade = {
      nome: nome.value,
      descricao,
      categoria: categoriaDestino,
      tipoEntidade,
      papelNegocio: papelNegocio || null,
      criadoPor: user?.nome || user?.username || "Usuário",
      campos: [],
    };

    const token =
      window.sessionStorage.getItem("token") ||
      window.localStorage.getItem("token");
    try {
      if (isEditingMode) {
        await editarEntidade(
          entidadeEmEdicao?.id ?? entidadeEmEdicao?._id,
          {
            ...novaEntidade,
            campos: Array.isArray(entidadeEmEdicao?.campos)
              ? entidadeEmEdicao.campos
              : [],
          },
          token,
        );
        navigate("/cadastros");
      } else {
        const criada = await adicionarEntidade(novaEntidade, token);
        const novaId = criada?.id ?? criada?._id;
        if (novaId) {
          navigate(`/cadastros?entidadeId=${novaId}`);
        } else {
          navigate("/cadastros");
        }
      }
    } catch (error) {
      setFormError(
        error?.message ||
          (isEditingMode
            ? "Não foi possível editar a entidade."
            : "Não foi possível criar a entidade."),
      );
    }
  }

  return (
    <section className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>
            {isEditingMode ? "Editar Entidade" : "Criar Entidade"}
          </h1>
          <p className={styles.description}>
            {isEditingMode
              ? "Atualize os dados da entidade."
              : "Preencha os dados para criar uma nova entidade."}
          </p>
        </div>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => navigate(-1)}
        >
          ← Voltar
        </button>
      </div>

      <div className={styles.card}>
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
                  checked={tabelaModo === "existente"}
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
                  checked={tabelaModo === "nova"}
                  onChange={(event) => setTabelaModo(event.target.value)}
                  disabled={isReadOnlyMode}
                />
                Criar nova
              </label>
            </div>

            {tabelaModo === "existente" && hasTabelas ? (
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
              <option value="Contato">Contato</option>
              <option value="Processo">Processo</option>
            </select>
          </div>

          <div className={styles.field}>
            <label htmlFor="papelNegocio" className={styles.label}>
              Papel de negócio
            </label>
            <select
              id="papelNegocio"
              name="papelNegocio"
              className={styles.select}
              value={papelNegocio}
              onChange={(event) => setPapelNegocio(event.target.value)}
              disabled={isReadOnlyMode}
            >
              <option value="">Nenhum</option>
              <option value="contato">
                Contato (Cliente, Fornecedor, Parceiro…)
              </option>
              <option value="processo">
                Processo (Pedido, Solicitação, Contrato…)
              </option>
            </select>
            <small style={{ color: "#6b7280", marginTop: 4, display: "block" }}>
              Define se registros desta entidade aparecem em /contatos ou
              /processos.
            </small>
          </div>

          <Button className={styles.button} disabled={isReadOnlyMode}>
            {isEditingMode ? "Salvar alterações" : "Criar"}
          </Button>
          {formError && <p className={styles.error}>{formError}</p>}
        </form>
      </div>
    </section>
  );
};

export default CriarEntidades;
