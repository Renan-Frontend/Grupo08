import React from "react";
import Activities from "../Activities/Activities";

// /contatos reaproveita integralmente o componente <Activities>, apenas
// trocando o filtro de tipo (`contato` em vez de `task`) e os textos do
// cabeçalho. Cada passo do tipo Contato configurado em uma oportunidade
// aparece como um card com o nome do passo como título principal e todo
// o conteúdo configurado nos 5 blocos do wizard (Resumo, Atores
// Envolvidos, Atributos, Indicadores, Anexos & Gráficos) — idêntico ao
// que /atividades exibe para passos do tipo Tarefa.
const ContatosPage = () => (
  <Activities
    typeFilter="contato"
    pageTitle="👥 Contatos"
    pageSubtitle="Passos do tipo Contato configurados nas oportunidades comerciais"
    newButtonLabel="Novo Contato"
  />
);

export default ContatosPage;
export { ContatosPage };
