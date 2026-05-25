import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./Tutorial.module.css";

const STEPS = [
  {
    id: 1,
    icon: "🤖",
    title: "Gerar Fluxograma (IA ou Manual)",
    route: "/ia",
    iaRoute: "/ia",
    manualRoute: "/gerar-bpmn",
    color: "#6366f1",
    colorLight: "#eef2ff",
    description:
      "Escolha entre criar com IA (descrição em linguagem natural) ou montar manualmente no editor visual.",
    steps: [
      "Escolha o modo de criação abaixo: 'Gerar com IA' ou 'Criar manualmente'.",
      "No modo IA, informe nome e descrição do processo para gerar o fluxograma automaticamente.",
      "No modo manual, abra o editor e monte o fluxo arrastando e conectando os blocos.",
      "Depois, salve e continue refinando o processo conforme necessário.",
    ],
    tip: "Use IA para ganhar velocidade e depois ajuste manualmente no editor quando precisar de maior precisão.",
  },
  {
    id: 2,
    icon: "🧩",
    title: "Cadastros (Entidades)",
    route: "/cadastros",
    color: "#f59e0b",
    colorLight: "#fffbeb",
    description:
      "Configure as entidades do seu negócio (empresas, produtos, contratos, etc.) com campos personalizados. Essas entidades alimentam os fluxogramas gerados pela IA.",
    steps: [
      "Acesse 'Cadastros' no menu lateral.",
      "Clique em + Nova Entidade e defina o nome (ex: 'Contrato', 'Produto').",
      "Adicione campos personalizados: texto, número, data, seleção, booleano.",
      "As entidades aparecem como opções ao descrever processos para a IA.",
    ],
    tip: "Crie entidades antes de gerar Fluxogramas complexos. A IA reconhece os nomes e usa os campos como variáveis no fluxo.",
  },
  {
    id: 3,
    icon: "💼",
    title: "Oportunidades",
    route: "/oportunidades",
    color: "#0ea5e9",
    colorLight: "#f0f9ff",
    description:
      "Gerencie oportunidades de negócio com pipeline visual. Cada oportunidade pode ter um fluxograma vinculado, responsável, valor e estágio.",
    steps: [
      "Acesse 'Oportunidades' no menu lateral.",
      "Clique em + Nova Oportunidade para criar — preencha nome, responsável, valor e estágio.",
      "Na listagem, clique em uma oportunidade para ver detalhes e o Fluxograma vinculado.",
      "Use os filtros por estágio e responsável para organizar o pipeline.",
    ],
    tip: "Vincule um fluxograma ao criar ou editar uma oportunidade. O diagrama ficará disponível diretamente na página de detalhes.",
  },
  {
    id: 4,
    icon: "📊",
    title: "Painel Geral (Dashboard)",
    route: "/dashboard",
    color: "#0f766e",
    colorLight: "#f0fdfa",
    description:
      "Visualize métricas consolidadas do seu pipeline: total de oportunidades, valores, atividades pendentes e desempenho por período.",
    steps: [
      "Acesse 'Painel Geral' no menu lateral.",
      "Veja os cards com resumo de oportunidades abertas, fechadas e perdidas.",
      "Use os filtros de período para analisar desempenho histórico.",
      "Clique nos cards para ir direto à listagem filtrada.",
    ],
    tip: "Consulte o dashboard diariamente para ter visibilidade do funil e identificar gargalos no processo comercial.",
  },
  {
    id: 5,
    icon: "📋",
    title: "Prospecções (Leads)",
    route: "/leads",
    color: "#8b5cf6",
    colorLight: "#f5f3ff",
    description:
      "Gerencie prospectos que ainda não são oportunidades. A IA pode gerar um Fluxograma de qualificação e você converte o lead em oportunidade com um clique.",
    steps: [
      "Acesse 'Prospecções' no menu lateral.",
      "Clique em + Novo Prospecto e preencha nome, email, empresa e origem.",
      "Clique no botão AI para gerar um Fluxograma de qualificação automaticamente.",
      "Quando qualificado, clique em ➜ para converter o lead em oportunidade.",
    ],
    tip: "O botão de conversão só fica habilitado após gerar o Fluxograma — isso garante que o processo de qualificação foi documentado.",
  },
  {
    id: 6,
    icon: "👤",
    title: "Contatos",
    route: "/contatos",
    color: "#10b981",
    colorLight: "#f0fdf4",
    description:
      "Centralize todos os contatos relacionados às suas oportunidades e processos: clientes, parceiros, fornecedores.",
    steps: [
      "Acesse 'Contatos' no menu lateral.",
      "Clique em + Novo Contato e preencha os dados.",
      "Vincule contatos às oportunidades para acompanhar o relacionamento.",
      "Use a busca para encontrar contatos por nome, email ou empresa.",
    ],
    tip: "Mantenha os contatos atualizados para facilitar a comunicação e o rastreamento de interações nas oportunidades.",
  },
  {
    id: 7,
    icon: "🗂️",
    title: "Processos",
    route: "/processos",
    color: "#0284c7",
    colorLight: "#e0f2fe",
    description:
      "Cadastre e gerencie os processos do negócio que serão usados como etapas do tipo Entidade → Processo nos fluxogramas.",
    steps: [
      "Acesse 'Processos' no menu lateral (seção Comercial).",
      "Clique em + Novo Processo e defina nome, descrição e campos relevantes.",
      "Esses processos ficam disponíveis ao configurar uma etapa do tipo Entidade no editor de Fluxograma (subtipo 'Processo').",
      "Edite ou remova processos para refletir mudanças do negócio.",
    ],
    tip: "Modele primeiro os processos centrais aqui; depois eles aparecem como opção pronta nas etapas Entidade → Processo dos fluxogramas.",
  },
  {
    id: 8,
    icon: "🔀",
    title: "Condições",
    route: "/condicoes",
    color: "#0891b2",
    colorLight: "#ecfeff",
    description:
      "Cadastre condições reutilizáveis usadas nas etapas de Decisão e nas conexões dos fluxogramas para definir os caminhos ✓ (sim) e ✕ (não).",
    steps: [
      "Acesse 'Condições' no menu lateral (seção Comercial).",
      "Clique em + Nova Condição e descreva a regra (ex.: 'Valor > R$ 10.000').",
      "Use essas condições nas etapas de Decisão e na 'Condição da conexão' entre etapas dentro do editor de Fluxograma.",
      "Mantenha as condições padronizadas para reaproveitamento em vários fluxos.",
    ],
    tip: "Padronizar as condições aqui evita escrever a mesma regra em vários fluxogramas e mantém o vocabulário do processo consistente.",
  },
  {
    id: 9,
    icon: "⏱️",
    title: "Tarefas",
    route: "/tarefas",
    color: "#ef4444",
    colorLight: "#fef2f2",
    description:
      "Registre e acompanhe tarefas vinculadas às oportunidades e contatos.",
    steps: [
      "Acesse 'Tarefas' no menu lateral.",
      "Crie tarefas diretamente ou pelo detalhe de uma oportunidade.",
      "Defina tipo, data, responsável e status (pendente, concluída).",
      "Acompanhe o Dashboard de Tarefas para ver o que está pendente.",
    ],
    tip: "Use tarefas para organizar a execução do processo comercial com rastreabilidade.",
  },
  {
    id: 10,
    icon: "👥",
    title: "Usuários",
    route: "/usuarios",
    color: "#64748b",
    colorLight: "#f8fafc",
    description:
      "Gerencie os usuários do sistema, defina papéis (admin, usuário) e controle quem pode acessar quais funcionalidades.",
    steps: [
      "Acesse 'Usuários' no menu lateral (requer permissão de admin).",
      "Veja todos os usuários cadastrados e seus papéis.",
      "Clique em + Novo Usuário para convidar alguém.",
      "Edite papéis e permissões conforme necessário.",
    ],
    tip: "Apenas administradores podem criar e editar usuários. Defina os papéis corretamente para garantir a segurança do sistema.",
  },
];

const Tutorial = () => {
  const navigate = useNavigate();
  const [expandedStep, setExpandedStep] = useState(null);

  const handleToggle = (id) => {
    setExpandedStep((prev) => (prev === id ? null : id));
  };

  return (
    <div className={styles.container}>
      <div className={styles.heroCard}>
        <div className={styles.heroIcon}>🗺️</div>
        <div>
          <h1 className={styles.heroTitle}>Tour pelo sistema</h1>
          <p className={styles.heroSubtitle}>
            Conheça todas as funcionalidades e como usá-las em ordem.
          </p>
        </div>
      </div>

      <div className={styles.grid}>
        {STEPS.map((step) => {
          const isOpen = expandedStep === step.id;
          return (
            <div
              key={step.id}
              className={`${styles.card} ${isOpen ? styles.cardOpen : ""}`}
              style={{
                "--accent": step.color,
                "--accent-light": step.colorLight,
              }}
            >
              <button
                className={styles.cardHeader}
                onClick={() => handleToggle(step.id)}
                aria-expanded={isOpen}
              >
                <span className={styles.cardNum}>{step.id}</span>
                <span className={styles.cardIcon}>{step.icon}</span>
                <div className={styles.cardTitleWrap}>
                  <span className={styles.cardTitle}>{step.title}</span>
                  <span className={styles.cardDesc}>{step.description}</span>
                </div>
                <span className={styles.chevron}>{isOpen ? "▲" : "▼"}</span>
              </button>

              {isOpen && (
                <div className={styles.cardBody}>
                  <ol className={styles.stepsList}>
                    {step.steps.map((s, i) => (
                      <li key={i} className={styles.stepItem}>
                        <span className={styles.stepDot}>{i + 1}</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ol>

                  <div className={styles.tip}>
                    <span className={styles.tipIcon}>💡</span>
                    <span>{step.tip}</span>
                  </div>

                  {step.id === 1 ? (
                    <div className={styles.actionRow}>
                      <button
                        className={styles.goBtn}
                        onClick={() => navigate(step.iaRoute)}
                      >
                        Gerar com IA →
                      </button>
                      <button
                        className={styles.goBtnSecondary}
                        onClick={() => navigate(step.manualRoute)}
                      >
                        Criar manualmente →
                      </button>
                    </div>
                  ) : (
                    <button
                      className={styles.goBtn}
                      onClick={() => navigate(step.route)}
                    >
                      Ir para {step.title} →
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className={styles.footer}>
        <p>
          Dúvidas? Comece por <strong>Gerar Fluxograma</strong> — é a
          funcionalidade central do sistema.
        </p>
        <button className={styles.startBtn} onClick={() => navigate("/ia")}>
          🚀 Começar agora
        </button>
      </div>
    </div>
  );
};

export default Tutorial;
