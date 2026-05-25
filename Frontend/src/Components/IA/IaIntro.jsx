import React from "react";
import { useNavigate } from "react-router-dom";
import styles from "./IaIntro.module.css";
import { AI_PARSE_POST, AI_PLAN_POST, AI_EXECUTE_POST } from "../../Api";
import { resolveToken, getErrorText } from "./iaHelpers";
import { EntidadesContext } from "../../Context/EntidadesContext";

const BPMN_SAVED_OPPORTUNITY_MAP_KEY =
  "bpmn_editor_saved_opportunity_by_slug_v1";

const slugifyBpmnName = (value = "") =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "novo-bpmn";

const EXAMPLE_NAME = "Aprovação de Pedido de Compra";
const EXAMPLE_DESC =
  "O processo de Aprovação de Pedido de Compra inicia quando o Cliente executa a atividade Solicitar compra, que gera um Pedido. " +
  "Em seguida é realizada a atividade Analisar Pedido. " +
  "O fluxo então avalia a condicional Pedido aprovado?: se NAO, é executada a atividade Registrar Aprovacao, que cria o registro de Aprovacao; " +
  "se SIM, é executada a atividade Validar orcamento. " +
  "O fluxo avalia a condicional Orcamento aprovado?: se NAO, é executada a atividade Atualizar Pedido; " +
  "se SIM, é executada a atividade Gerar OrdemDeCompra, que cria o documento OrdemDeCompra. " +
  "Em seguida é executada a atividade Enviar OrdemDeCompra ao Fornecedor, e o Fornecedor então executa a atividade Fornecedor recebe OrdemDeCompra.";

const IaIntro = () => {
  const navigate = useNavigate();
  const { entidades } = React.useContext(EntidadesContext);
  const [introProcessName, setIntroProcessName] = React.useState("");
  const [introDescription, setIntroDescription] = React.useState("");
  const [isParsing, setIsParsing] = React.useState(false);
  const [introFeedback, setIntroFeedback] = React.useState("");

  const entityCatalog = React.useMemo(
    () =>
      (Array.isArray(entidades) ? entidades : []).map((entidade) => ({
        id: entidade?.id ?? null,
        nome: String(entidade?.nome || entidade?.name || "").trim(),
        descricao: String(entidade?.descricao || "").trim(),
        tipoEntidade: String(entidade?.tipoEntidade || "").trim(),
        campos: Array.isArray(entidade?.campos)
          ? entidade.campos.map((campo) => ({
              nome: String(campo?.nome || "").trim(),
              tipo: String(campo?.tipo || "").trim(),
              keyType: String(campo?.keyType || "").trim(),
            }))
          : [],
      })),
    [entidades],
  );

  const canParse =
    introProcessName.trim().length >= 3 || introDescription.trim().length >= 10;

  const handleParseDescription = async (event) => {
    event.preventDefault();
    const trimmedName = introProcessName.trim();
    const trimmedDesc = introDescription.trim();
    if (!trimmedName && !trimmedDesc) return;

    const token = resolveToken();
    if (!token) {
      setIntroFeedback("Faça login novamente para usar o operador de IA.");
      return;
    }

    setIsParsing(true);
    setIntroFeedback("");

    try {
      const { url, options } = AI_PARSE_POST(
        { processName: trimmedName, description: trimmedDesc },
        token,
      );
      const response = await fetch(url, options);
      if (!response.ok) {
        const errorText = await getErrorText(
          response,
          "Falha ao analisar a descrição.",
        );
        setIntroFeedback(errorText);
        setIsParsing(false);
        return;
      }

      const parseData = await response.json();

      // Build flowOrder from parseData (same logic as IaConfigurar)
      const fo = Array.isArray(parseData.flowOrder) ? parseData.flowOrder : [];
      const mappedFo = fo.map((item) => ({
        name: String(item.name || "").trim(),
        type: String(item.type || "task").trim(),
        desc: String(item.desc || "").trim(),
        ...(item.tipoEntidade ? { tipoEntidade: item.tipoEntidade } : {}),
        ...(item.branches ? { branches: item.branches } : {}),
      }));
      const foNames = new Set(mappedFo.map((i) => i.name.toLowerCase()));
      (Array.isArray(parseData.entities) ? parseData.entities : []).forEach(
        (ent) => {
          const n =
            typeof ent === "object"
              ? String(ent?.name || "").trim()
              : String(ent || "").trim();
          const tipo =
            typeof ent === "object" ? ent?.tipoEntidade || "apoio" : "apoio";
          if (n && !foNames.has(n.toLowerCase())) {
            mappedFo.push({
              name: n,
              type: "entidade",
              desc: "",
              tipoEntidade: tipo,
            });
            foNames.add(n.toLowerCase());
          }
        },
      );
      (Array.isArray(parseData.activities) ? parseData.activities : []).forEach(
        (name) => {
          const n = String(name || "").trim();
          if (n && !foNames.has(n.toLowerCase())) {
            mappedFo.push({ name: n, type: "task", desc: "" });
            foNames.add(n.toLowerCase());
          }
        },
      );
      (Array.isArray(parseData.conditionals)
        ? parseData.conditionals
        : []
      ).forEach((name) => {
        let n = String(name || "").trim();
        if (!n) return;
        if (!n.endsWith("?")) n += "?";
        if (!foNames.has(n.toLowerCase())) {
          mappedFo.push({ name: n, type: "condicional", desc: "" });
          foNames.add(n.toLowerCase());
        }
      });

      const processName = String(
        parseData.processName || trimmedName || "",
      ).trim();
      const flowLines = mappedFo
        .map((item) => (item.desc ? `${item.name} (${item.desc})` : item.name))
        .join(" -> ");
      const enrichedGoal = [
        processName ? `Nome do processo: ${processName}` : "",
        trimmedDesc ? `Descrição do processo: ${trimmedDesc}` : "",
        flowLines,
      ]
        .filter(Boolean)
        .join("\n");

      const suggestedEntityNames = mappedFo
        .filter((i) => i.type === "entidade")
        .map((i) => i.name);
      const suggestedActivities = mappedFo
        .filter((i) => i.type === "task")
        .map((i) => i.name);
      const suggestedConditionals = mappedFo
        .filter((i) => i.type === "condicional")
        .map((i) => i.name);

      setIntroFeedback("Criando processo...");

      const planBody = {
        goal: enrichedGoal,
        context: {
          processName,
          flowOrder: mappedFo.length > 0 ? mappedFo : undefined,
          suggestedEntityNames:
            suggestedEntityNames.length > 0 ? suggestedEntityNames : undefined,
          suggestedActivities:
            suggestedActivities.length > 0 ? suggestedActivities : undefined,
          suggestedConditionals:
            suggestedConditionals.length > 0
              ? suggestedConditionals
              : undefined,
          existingEntities: entityCatalog,
        },
      };

      const { url: planUrl, options: planOptions } = AI_PLAN_POST(
        planBody,
        token,
      );
      const planResponse = await fetch(planUrl, planOptions);
      if (!planResponse.ok) {
        const errorText = await getErrorText(
          planResponse,
          "Falha ao gerar plano da IA.",
        );
        setIntroFeedback(errorText);
        setIsParsing(false);
        return;
      }

      const planPayload = await planResponse.json();
      const plan =
        planPayload?.plan && typeof planPayload.plan === "object"
          ? planPayload.plan
          : null;
      const actions = Array.isArray(plan?.actions) ? plan.actions : [];
      const approvedActions = actions
        .map((a) => String(a?.id || "").trim())
        .filter(Boolean);

      if (!plan || approvedActions.length === 0) {
        setIntroFeedback("Plano gerado, mas nenhuma ação identificada.");
        setIsParsing(false);
        return;
      }

      const execBody = { plan, approvedActions };
      const { url: execUrl, options: execOptions } = AI_EXECUTE_POST(
        execBody,
        token,
      );
      const execResponse = await fetch(execUrl, execOptions);
      if (!execResponse.ok) {
        const errorText = await getErrorText(
          execResponse,
          "Falha ao criar o processo.",
        );
        setIntroFeedback(errorText);
        setIsParsing(false);
        return;
      }

      const execPayload = await execResponse.json();
      window.dispatchEvent(
        new CustomEvent("ia:actions-executed", {
          detail: {
            executed: Number(execPayload?.executed || 0),
            approvedActions,
            plan,
          },
        }),
      );

      const results = Array.isArray(execPayload?.results)
        ? execPayload.results
        : [];
      const bpmnResult = results.find((r) => r?.type === "update_bpmn_state");
      const opportunityResult = results.find(
        (r) => r?.type === "create_oportunidade",
      );
      const opportunityId =
        bpmnResult?.syncedOpportunity?.id ??
        bpmnResult?.syncedOpportunity?._id ??
        opportunityResult?.result?.id ??
        opportunityResult?.result?._id ??
        null;
      const opportunityName =
        bpmnResult?.syncedOpportunity?.nome ??
        bpmnResult?.syncedOpportunity?.name ??
        opportunityResult?.result?.nome ??
        opportunityResult?.result?.name ??
        processName;
      const bpmnSlug = slugifyBpmnName(opportunityName);

      if (opportunityId !== null && opportunityId !== undefined && bpmnSlug) {
        try {
          const rawMap = window.localStorage.getItem(
            BPMN_SAVED_OPPORTUNITY_MAP_KEY,
          );
          const existingMap = rawMap ? JSON.parse(rawMap) : {};
          window.localStorage.setItem(
            BPMN_SAVED_OPPORTUNITY_MAP_KEY,
            JSON.stringify({ ...existingMap, [bpmnSlug]: opportunityId }),
          );
        } catch (_) {}
        navigate(`/gerar-bpmn/${bpmnSlug}`);
      } else {
        navigate("/gerar-bpmn/criar");
      }
    } catch {
      setIntroFeedback("Erro ao conectar. Tente novamente.");
    } finally {
      setIsParsing(false);
    }
  };

  return (
    <section className={styles.wrapper}>
      <button
        type="button"
        className={styles.backButton}
        onClick={() => navigate(-1)}
      >
        ← Voltar
      </button>
      <header className={styles.hero}>
        <div>
          <h1>Criar Processo</h1>
          <p>
            Descreva o processo com suas próprias palavras e a IA monta o fluxo
            de entidades, atividades e condicionais automaticamente.
          </p>
        </div>
        <button
          type="button"
          className={styles.generateButton}
          onClick={() => navigate(-1)}
        >
          ← Voltar
        </button>
      </header>
      <form className={styles.formCard} onSubmit={handleParseDescription}>
        <label className={styles.field}>
          <span>Nome do processo</span>
          <input
            name="introProcessName"
            value={introProcessName}
            onChange={(e) => setIntroProcessName(e.target.value)}
            placeholder="Ex.: Aprovação de pedido de compra"
            autoFocus
          />
        </label>
        <label className={styles.field}>
          <span>Descreva o processo</span>
          <textarea
            rows={20}
            name="introDescription"
            style={{ resize: "vertical", minHeight: 360 }}
            value={introDescription}
            onChange={(e) => setIntroDescription(e.target.value)}
            placeholder={
              "Descreva o fluxo completo do processo. Ex.:\n\n" +
              "O cliente solicita uma compra. O gestor analisa o pedido. " +
              "Se aprovado, o financeiro valida o orçamento. " +
              "Se o orçamento for suficiente, gera a ordem de compra e envia ao fornecedor. " +
              "Caso contrário, o pedido é devolvido para ajuste."
            }
          />
        </label>
        <button
          type="button"
          className={styles.secondaryButton}
          style={{
            alignSelf: "flex-start",
            fontSize: "0.8rem",
            padding: "4px 12px",
          }}
          onClick={() => {
            setIntroProcessName(EXAMPLE_NAME);
            setIntroDescription(EXAMPLE_DESC);
          }}
        >
          ✦ Preencher com exemplo
        </button>
        {introFeedback ? (
          <p className={styles.feedback}>{introFeedback}</p>
        ) : null}
        <button
          type="submit"
          className={styles.generateButton}
          disabled={!canParse || isParsing}
        >
          {isParsing ? "Criando processo..." : "Criar processo"}
        </button>
      </form>
    </section>
  );
};

export default IaIntro;
