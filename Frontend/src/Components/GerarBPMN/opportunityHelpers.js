import { BPMN_STAGES } from './bpmnStages';

export const normalize = (value = '') =>
  String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

export const getOpportunityName = (opportunity) =>
  opportunity?.name || opportunity?.nome || 'Oportunidade sem nome';

export const getOpportunityStage = (opportunity) =>
  opportunity?.status || opportunity?.etapa || BPMN_STAGES[0];

export const getStageIndex = (opportunity) => {
  if (
    typeof opportunity?.stageIndex === 'number' &&
    opportunity.stageIndex >= 0 &&
    opportunity.stageIndex < BPMN_STAGES.length
  ) {
    return opportunity.stageIndex;
  }

  const current = normalize(getOpportunityStage(opportunity));
  const idx = BPMN_STAGES.findIndex((stage) => normalize(stage) === current);
  return idx >= 0 ? idx : 0;
};
