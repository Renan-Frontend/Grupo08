import React from "react";
import Activities from "../Activities/Activities";

// /condicoes reaproveita integralmente o componente <Activities>, apenas
// trocando o filtro de tipo (`condicional` em vez de `task`) e os textos
// do cabeçalho. Toda a UX de cards, edição inline dos 4 passos
// (Atores/Atributos/Indicadores/Anexos), impressão e exportação são
// herdadas automaticamente.
const Condicoes = () => (
  <Activities
    typeFilter="condicional"
    pageTitle="🔀 Condições"
    pageSubtitle="Condições configuradas nas oportunidades comerciais"
    newButtonLabel="Nova Condição"
  />
);

export default Condicoes;
