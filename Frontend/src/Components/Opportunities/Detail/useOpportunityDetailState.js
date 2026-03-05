import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { resolveSelectedOwner } from '../opportunityOwnershipRules';
import { EntidadesContext } from '../../../Context/EntidadesContext';
import { fetchOpportunitiesPage, getAuthToken } from '../opportunityApi';

const defaultStages = [
  { id: 1, label: '', done: false },
  { id: 2, label: '', done: false },
  { id: 3, label: '', done: false },
];

const isEntityNode = (node) =>
  node?.active !== false &&
  node?.nodeType !== 'task' &&
  node?.nodeType !== 'condicional';

const getBpmnStageType = (node) => {
  if (node?.nodeType === 'task') return 'task';
  if (node?.nodeType === 'condicional') return 'condicional';
  return 'entidade';
};

const isBpmnStageNode = (node) =>
  node?.active !== false &&
  ['entidade', 'task', 'condicional'].includes(getBpmnStageType(node));

const sortNodeIdsByPosition = (nodeIds, nodesById) =>
  [...nodeIds].sort((a, b) => {
    const nodeA = nodesById.get(String(a)) || {};
    const nodeB = nodesById.get(String(b)) || {};
    const xDiff = (Number(nodeA.x) || 0) - (Number(nodeB.x) || 0);
    if (xDiff !== 0) return xDiff;
    const yDiff = (Number(nodeA.y) || 0) - (Number(nodeB.y) || 0);
    if (yDiff !== 0) return yDiff;
    return String(a).localeCompare(String(b));
  });

const normalizeDecisionValue = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const isNegativeDecision = (value) => {
  const normalized = normalizeDecisionValue(value);
  if (!normalized) return false;
  return (
    normalized === 'nao' ||
    normalized === 'no' ||
    normalized === 'x nao' ||
    normalized === 'x no' ||
    normalized.includes('nao')
  );
};

const selectPrimaryOutgoingConnection = (
  connections = [],
  nodesById = null,
) => {
  if (!Array.isArray(connections) || connections.length === 0) return null;

  const preferred = connections.find((connection) => {
    const normalizedDecision = normalizeDecisionValue(connection?.decision);
    return (
      normalizedDecision === 'sim' ||
      normalizedDecision === 'yes' ||
      normalizedDecision === 'principal' ||
      normalizedDecision === 'default'
    );
  });

  if (preferred) return preferred;

  const hasExplicitNegativeDecision = connections.some((connection) =>
    isNegativeDecision(connection?.decision),
  );

  if (hasExplicitNegativeDecision) {
    const firstNonNegative = connections.find(
      (connection) => !isNegativeDecision(connection?.decision),
    );
    if (firstNonNegative) return firstNonNegative;
  }

  const sourceNodeId = String(connections[0]?.from || '').trim();
  const sourceNode =
    nodesById && sourceNodeId ? nodesById.get(sourceNodeId) : null;
  const sourceType = String(sourceNode?.nodeType || '')
    .trim()
    .toLowerCase();
  const sourceGatewayType = String(sourceNode?.gatewayType || '')
    .trim()
    .toLowerCase();

  const isConditionalGateway =
    sourceType === 'condicional' ||
    sourceGatewayType === 'xor' ||
    sourceGatewayType === 'and' ||
    sourceGatewayType === 'or';

  if (isConditionalGateway && nodesById) {
    const rightMost = [...connections].sort((connectionA, connectionB) => {
      const nodeA = nodesById.get(String(connectionA?.to || '')) || {};
      const nodeB = nodesById.get(String(connectionB?.to || '')) || {};
      const xDiff = (Number(nodeB?.x) || 0) - (Number(nodeA?.x) || 0);
      if (xDiff !== 0) return xDiff;
      const yDiff = (Number(nodeA?.y) || 0) - (Number(nodeB?.y) || 0);
      if (yDiff !== 0) return yDiff;
      return String(connectionA?.to || '').localeCompare(
        String(connectionB?.to || ''),
      );
    })[0];

    if (rightMost) return rightMost;
  }

  return connections[0] || null;
};

const getStageLabelFromNode = (node, fallbackIndex) => {
  if (node?.nodeType === 'task') {
    const taskName = String(node?.taskNome || '').trim();
    if (taskName) return taskName;
  }

  if (node?.nodeType === 'condicional') {
    const conditionalName = String(node?.condicionalNome || '').trim();
    if (conditionalName) return conditionalName;
  }

  const directLabel = String(node?.entidadeNome || '').trim();
  if (directLabel) return directLabel;

  const entityLikeLabel = String(node?.label || '').trim();
  if (entityLikeLabel) return entityLikeLabel;

  const subtitle = String(node?.subtitle || '').trim();
  if (subtitle) return subtitle;

  return `Entidade ${fallbackIndex + 1}`;
};

const buildStagesFromBpmn = (opportunity) => {
  const rawNodes = Array.isArray(opportunity?.bpmn?.nodes)
    ? opportunity.bpmn.nodes
    : [];
  const rawConnections = Array.isArray(opportunity?.bpmn?.connections)
    ? opportunity.bpmn.connections
    : [];

  if (rawNodes.length === 0) return [];

  const activeNodes = rawNodes.filter((node) => node?.active !== false);
  const nodesById = new Map(activeNodes.map((node) => [String(node.id), node]));
  const stageNodeIds = activeNodes
    .filter((node) => isBpmnStageNode(node))
    .map((node) => String(node.id));

  if (stageNodeIds.length === 0) return [];

  const incomingCount = new Map();
  const adjacency = new Map();

  activeNodes.forEach((node) => {
    const id = String(node.id);
    incomingCount.set(id, 0);
    adjacency.set(id, []);
  });

  rawConnections.forEach((connection) => {
    const fromId = String(connection?.from || '');
    const toId = String(connection?.to || '');
    if (!nodesById.has(fromId) || !nodesById.has(toId)) return;

    adjacency.get(fromId)?.push({
      from: fromId,
      to: toId,
      decision: String(connection?.decision || '').trim(),
    });
    incomingCount.set(toId, (incomingCount.get(toId) || 0) + 1);
  });

  const orderedOutgoings = new Map();
  adjacency.forEach((outgoingConnections, fromId) => {
    const ordered = [...outgoingConnections].sort(
      (connectionA, connectionB) => {
        const toA = String(connectionA?.to || '');
        const toB = String(connectionB?.to || '');
        return sortNodeIdsByPosition([toA, toB], nodesById)[0] === toA ? -1 : 1;
      },
    );

    orderedOutgoings.set(fromId, ordered);
  });

  const explicitPrimaryNode = activeNodes.find(
    (node) => isEntityNode(node) && node?.isPrimaryEntity === true,
  );

  const stageNodesWithoutIncoming = stageNodeIds.filter(
    (id) => (incomingCount.get(String(id)) || 0) === 0,
  );

  const startNodeId = explicitPrimaryNode
    ? String(explicitPrimaryNode.id)
    : sortNodeIdsByPosition(
        stageNodesWithoutIncoming.length > 0
          ? stageNodesWithoutIncoming
          : stageNodeIds,
        nodesById,
      )[0];

  const visited = new Set();
  const orderedNodeIds = [];
  let currentNodeId = startNodeId ? String(startNodeId) : '';

  while (currentNodeId && !visited.has(currentNodeId)) {
    visited.add(currentNodeId);
    orderedNodeIds.push(currentNodeId);

    const outgoings = orderedOutgoings.get(currentNodeId) || [];
    const primaryOutgoing = selectPrimaryOutgoingConnection(
      outgoings,
      nodesById,
    );

    if (!primaryOutgoing?.to) break;

    const nextNodeId = String(primaryOutgoing.to);
    if (!nodesById.has(nextNodeId)) break;

    currentNodeId = nextNodeId;
  }

  const orderedStageIds = orderedNodeIds.filter((id) =>
    stageNodeIds.includes(String(id)),
  );

  const normalizedStatus = String(
    opportunity?.status || opportunity?.etapa || '',
  )
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

  const currentNodeCandidate = String(
    opportunity?.currentNodeId ||
      opportunity?.activeNodeId ||
      opportunity?.bpmnNodeId ||
      opportunity?.bpmnCurrentNodeId ||
      opportunity?.sourceNodeId ||
      opportunity?.bpmn?.currentNodeId ||
      '',
  ).trim();

  const stages = orderedStageIds.map((stageNodeId, index) => {
    const node = nodesById.get(String(stageNodeId));
    return {
      id: index + 1,
      label: getStageLabelFromNode(node, index),
      done: false,
      fromBpmn: true,
      sourceNodeId: String(stageNodeId),
      stageType: getBpmnStageType(node),
    };
  });

  let activeStageIndex = -1;

  if (currentNodeCandidate) {
    activeStageIndex = stages.findIndex(
      (stage) => String(stage.sourceNodeId) === currentNodeCandidate,
    );
  }

  if (activeStageIndex < 0) {
    const stageIndex =
      Number.isFinite(opportunity?.stageIndex) && opportunity.stageIndex >= 0
        ? Number(opportunity.stageIndex)
        : -1;
    if (stageIndex >= 0) {
      activeStageIndex = Math.min(stageIndex, stages.length - 1);
    }
  }

  if (activeStageIndex < 0 && normalizedStatus) {
    activeStageIndex = stages.findIndex((stage) => {
      const normalizedLabel = String(stage.label || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
      return normalizedLabel && normalizedLabel === normalizedStatus;
    });
  }

  return stages.map((stage, index) => ({
    ...stage,
    done: activeStageIndex >= 0 ? index <= activeStageIndex : false,
  }));
};

const defaultTimelineItems = [];

const titleFromSlug = (value) => {
  return value
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const formatDateToDayMonthYear = (value) => {
  if (!value || typeof value !== 'string') return '';

  const isoDateMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDateMatch) {
    const [, year, month, day] = isoDateMatch;
    return `${day}/${month}/${year}`;
  }

  return value;
};

const getStoredVisibility = (opportunity, key, storageKey, fallback) => {
  if (typeof opportunity?.[key] === 'boolean') {
    return opportunity[key];
  }
  const saved = localStorage.getItem(storageKey);
  return saved !== null ? JSON.parse(saved) : fallback;
};

const getCurrentTimelineTime = () =>
  new Date().toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });

const getCurrentTimelineTimestamp = () => new Date().toISOString();

const normalizeTopicLabel = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const normalizeTopicType = (value) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (normalized === 'decisao') return 'decisao';
  if (normalized === 'atividade') return 'atividade';
  return 'dados';
};

const normalizeManualTopicStatus = (value) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (normalized === 'concluido' || normalized === 'concluído') {
    return 'concluido';
  }
  return 'pendente';
};

const getTopicTypeFromStageType = (stageType) => {
  const normalized = String(stageType || '')
    .trim()
    .toLowerCase();
  if (normalized === 'condicional') return 'decisao';
  if (normalized === 'task') return 'atividade';
  return 'dados';
};

const resolveEntityAtributoChave = (entity) => {
  const directValue = String(
    entity?.atributoChave ||
      entity?.atributo_chave ||
      entity?.keyAttribute ||
      '',
  ).trim();

  if (directValue) return directValue;

  const campos = Array.isArray(entity?.campos) ? entity.campos : [];
  const primaryKeyField = campos.find((campo) => {
    const keyType = String(campo?.keyType || campo?.chave || '')
      .trim()
      .toUpperCase();
    return keyType === 'PK';
  });

  return String(primaryKeyField?.nome || '').trim();
};

const getEntitySnapshotKey = (entity) => {
  const entityId = entity?.id;
  if (entityId !== null && entityId !== undefined && String(entityId).trim()) {
    return `id:${String(entityId).trim()}`;
  }

  const normalizedName = normalizeTopicLabel(entity?.nome || '');
  return normalizedName ? `name:${normalizedName}` : '';
};

const buildEntityFingerprint = (entity) =>
  safeStringify({
    nome: String(entity?.nome || '').trim(),
    descricao: String(entity?.descricao || '').trim(),
    atributoChave: String(entity?.atributoChave || '').trim(),
    tipoEntidade: String(entity?.tipoEntidade || '').trim(),
    isPrimaryEntity: entity?.isPrimaryEntity === true,
    campos: (Array.isArray(entity?.campos) ? entity.campos : [])
      .map((campo) => ({
        nome: String(campo?.nome || '').trim(),
        tipo: String(campo?.tipo || '').trim(),
        obrigatorio: campo?.obrigatorio === true,
      }))
      .sort((campoA, campoB) =>
        String(campoA?.nome || '').localeCompare(String(campoB?.nome || '')),
      ),
  });

const diffLinkedEntities = (previousEntities = [], nextEntities = []) => {
  const previousMap = new Map(
    (Array.isArray(previousEntities) ? previousEntities : [])
      .map((entity) => [getEntitySnapshotKey(entity), entity])
      .filter(([key]) => Boolean(key)),
  );

  const nextMap = new Map(
    (Array.isArray(nextEntities) ? nextEntities : [])
      .map((entity) => [getEntitySnapshotKey(entity), entity])
      .filter(([key]) => Boolean(key)),
  );

  const created = [];
  const updated = [];
  const removed = [];

  nextMap.forEach((entity, key) => {
    const previousEntity = previousMap.get(key);
    if (!previousEntity) {
      created.push(entity);
      return;
    }

    if (
      buildEntityFingerprint(previousEntity) !== buildEntityFingerprint(entity)
    ) {
      updated.push({ previous: previousEntity, current: entity });
    }
  });

  previousMap.forEach((entity, key) => {
    if (!nextMap.has(key)) {
      removed.push(entity);
    }
  });

  return { created, updated, removed };
};

const normalizeVisibilityValue = (value, fallback) =>
  typeof value === 'boolean' ? value : fallback;

const buildOpportunityCoreSnapshot = (opportunity) => ({
  title: String(opportunity?.name || opportunity?.nome || '').trim(),
  status: String(opportunity?.status || opportunity?.etapa || '').trim(),
  owner: String(
    opportunity?.responsavelNome ||
      opportunity?.responsavel ||
      opportunity?.owner ||
      opportunity?.criadoPor ||
      '',
  ).trim(),
  createdDate: formatDateToDayMonthYear(
    opportunity?.createdDate || opportunity?.created_at || '',
  ),
  endDate: String(opportunity?.endDate || '').trim(),
  pipelineTitle: String(opportunity?.pipelineTitle || '').trim(),
  pipelineSubtitle: String(opportunity?.pipelineSubtitle || '').trim(),
  showPipeline: normalizeVisibilityValue(opportunity?.showPipeline, true),
  showTopico: normalizeVisibilityValue(opportunity?.showTopico, false),
  showTimeline: normalizeVisibilityValue(opportunity?.showTimeline, true),
});

const buildBpmnActivitySnapshot = (opportunity) => {
  const nodes = Array.isArray(opportunity?.bpmn?.nodes)
    ? opportunity.bpmn.nodes
    : [];
  const connections = Array.isArray(opportunity?.bpmn?.connections)
    ? opportunity.bpmn.connections
    : [];
  const activeNodes = nodes.filter((node) => node?.active !== false);

  const mainPathStages = buildStagesFromBpmn(opportunity);
  const mainPathLabels = mainPathStages
    .map((stage) => String(stage?.label || '').trim())
    .filter(Boolean)
    .join(' > ');

  return {
    totalNodes: nodes.length,
    activeNodes: activeNodes.length,
    totalConnections: connections.length,
    entityStages: activeNodes.filter(
      (node) => getBpmnStageType(node) === 'entidade',
    ).length,
    taskStages: activeNodes.filter((node) => getBpmnStageType(node) === 'task')
      .length,
    decisionStages: activeNodes.filter(
      (node) => getBpmnStageType(node) === 'condicional',
    ).length,
    mainPathCount: mainPathStages.length,
    mainPathLabels,
  };
};

const describeOpportunityCoreChanges = (previousSnapshot, nextSnapshot) => {
  const previous = previousSnapshot || {};
  const next = nextSnapshot || {};
  const notes = [];

  if (previous.title !== next.title && next.title) {
    notes.push({
      key: 'title',
      title: 'Nome da oportunidade atualizado',
      description: `Antes: ${previous.title || '-'} → Agora: ${next.title}`,
      elementType: 'oportunidade',
      itemName: 'Nome da oportunidade',
      before: previous.title || '-',
      after: next.title,
    });
  }

  if (previous.status !== next.status && next.status) {
    notes.push({
      key: 'status',
      title: 'Status da oportunidade atualizado',
      description: `Antes: ${previous.status || '-'} → Agora: ${next.status}`,
      elementType: 'status',
      itemName: 'Status da oportunidade',
      before: previous.status || '-',
      after: next.status,
    });
  }

  if (previous.owner !== next.owner && next.owner) {
    notes.push({
      key: 'owner',
      title: 'Responsável da oportunidade atualizado',
      description: `Antes: ${previous.owner || '-'} → Agora: ${next.owner}`,
      elementType: 'proprietario',
      itemName: 'Responsável',
      before: previous.owner || '-',
      after: next.owner,
    });
  }

  if (
    previous.createdDate !== next.createdDate ||
    previous.endDate !== next.endDate
  ) {
    notes.push({
      key: 'dates',
      title: 'Datas da oportunidade atualizadas',
      description: `Criação: ${previous.createdDate || '-'} → ${next.createdDate || '-'} | Final: ${previous.endDate || '-'} → ${next.endDate || '-'}`,
      elementType: 'datas',
      itemName: 'Datas da oportunidade',
      before: `Criação: ${previous.createdDate || '-'} | Final: ${previous.endDate || '-'}`,
      after: `Criação: ${next.createdDate || '-'} | Final: ${next.endDate || '-'}`,
    });
  }

  if (
    previous.pipelineTitle !== next.pipelineTitle ||
    previous.pipelineSubtitle !== next.pipelineSubtitle
  ) {
    notes.push({
      key: 'pipeline-meta',
      title: 'Metadados da pipeline atualizados',
      description: `Título: ${previous.pipelineTitle || '-'} → ${next.pipelineTitle || '-'} | Subtítulo: ${previous.pipelineSubtitle || '-'} → ${next.pipelineSubtitle || '-'}`,
      elementType: 'pipeline',
      itemName: 'Pipeline',
      before: `${previous.pipelineTitle || '-'} | ${previous.pipelineSubtitle || '-'}`,
      after: `${next.pipelineTitle || '-'} | ${next.pipelineSubtitle || '-'}`,
    });
  }

  if (
    previous.showPipeline !== next.showPipeline ||
    previous.showTopico !== next.showTopico ||
    previous.showTimeline !== next.showTimeline
  ) {
    notes.push({
      key: 'layout',
      title: 'Layout da oportunidade atualizado',
      description: [
        `Pipeline: ${previous.showPipeline ? 'visível' : 'oculta'} → ${next.showPipeline ? 'visível' : 'oculta'}`,
        `Tópico: ${previous.showTopico ? 'visível' : 'oculto'} → ${next.showTopico ? 'visível' : 'oculto'}`,
        `Timeline: ${previous.showTimeline ? 'visível' : 'oculta'} → ${next.showTimeline ? 'visível' : 'oculta'}`,
      ].join(' | '),
      elementType: 'layout',
      itemName: 'Layout da oportunidade',
      before: 'Configuração anterior',
      after: 'Configuração atual',
    });
  }

  return notes;
};

const describeBpmnActivityChanges = (previousSnapshot, nextSnapshot) => {
  const previous = previousSnapshot || {};
  const next = nextSnapshot || {};
  const changes = [];

  if (previous.totalNodes !== next.totalNodes) {
    changes.push(`Nós: ${previous.totalNodes || 0} → ${next.totalNodes || 0}`);
  }
  if (previous.activeNodes !== next.activeNodes) {
    changes.push(
      `Nós ativos: ${previous.activeNodes || 0} → ${next.activeNodes || 0}`,
    );
  }
  if (previous.totalConnections !== next.totalConnections) {
    changes.push(
      `Conexões: ${previous.totalConnections || 0} → ${next.totalConnections || 0}`,
    );
  }
  if (previous.entityStages !== next.entityStages) {
    changes.push(
      `Entidades: ${previous.entityStages || 0} → ${next.entityStages || 0}`,
    );
  }
  if (previous.taskStages !== next.taskStages) {
    changes.push(
      `Atividades: ${previous.taskStages || 0} → ${next.taskStages || 0}`,
    );
  }
  if (previous.decisionStages !== next.decisionStages) {
    changes.push(
      `Decisões: ${previous.decisionStages || 0} → ${next.decisionStages || 0}`,
    );
  }
  if (previous.mainPathCount !== next.mainPathCount) {
    changes.push(
      `Etapas na trilha principal: ${previous.mainPathCount || 0} → ${next.mainPathCount || 0}`,
    );
  }

  return changes;
};

const buildOpportunitySignature = (opportunity) =>
  safeStringify({
    id: opportunity?.id ?? opportunity?._id ?? null,
    ...buildOpportunityCoreSnapshot(opportunity),
    updatedAt: String(opportunity?.updatedAt || opportunity?.updated_at || ''),
  });

const safeStringify = (value) => {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value || '');
  }
};

const getLinkedBpmnEntitiesSnapshot = (opportunity, entidadesCatalog = []) => {
  const bpmnNodes = Array.isArray(opportunity?.bpmn?.nodes)
    ? opportunity.bpmn.nodes
    : [];

  const linkedEntityIds = new Set();
  const linkedEntityNames = new Set();

  bpmnNodes.forEach((node) => {
    if (node?.active === false) return;

    const rawEntityId = node?.entidadeId;
    const rawEntityName = node?.entidadeNome || node?.label || node?.subtitle;

    if (
      rawEntityId !== null &&
      rawEntityId !== undefined &&
      String(rawEntityId).trim()
    ) {
      linkedEntityIds.add(String(rawEntityId).trim());
    }

    const normalizedName = normalizeTopicLabel(rawEntityName);
    if (normalizedName) {
      linkedEntityNames.add(normalizedName);
    }
  });

  return (Array.isArray(entidadesCatalog) ? entidadesCatalog : [])
    .filter((entidade) => {
      const entityId = entidade?.id ?? entidade?._id;
      const entityName = normalizeTopicLabel(
        entidade?.nome || entidade?.name || entidade?.titulo,
      );

      const hasId =
        entityId !== null &&
        entityId !== undefined &&
        linkedEntityIds.has(String(entityId).trim());

      const hasName = entityName && linkedEntityNames.has(entityName);

      return hasId || hasName;
    })
    .map((entidade) => ({
      id: entidade?.id ?? entidade?._id ?? null,
      nome: String(entidade?.nome || entidade?.name || entidade?.titulo || ''),
      descricao: String(entidade?.descricao || ''),
      tipoEntidade: String(entidade?.tipoEntidade || '').trim(),
      criadoPor: String(entidade?.criadoPor || entidade?.owner || '').trim(),
      isPrimaryEntity: entidade?.isPrimaryEntity === true,
      atributoChave:
        entidade?.atributoChave !== undefined &&
        entidade?.atributoChave !== null
          ? String(entidade.atributoChave)
          : entidade?.atributo_chave !== undefined &&
              entidade?.atributo_chave !== null
            ? String(entidade.atributo_chave)
            : '',
      campos: (Array.isArray(entidade?.campos) ? entidade.campos : [])
        .map((campo) => ({
          nome: String(campo?.nome || ''),
          tipo: String(campo?.tipo || ''),
          obrigatorio: campo?.obrigatorio === true,
        }))
        .sort((campoA, campoB) =>
          String(campoA?.nome || '').localeCompare(String(campoB?.nome || '')),
        ),
    }))
    .sort((entityA, entityB) =>
      String(entityA?.nome || '').localeCompare(String(entityB?.nome || '')),
    );
};

const buildEntitySummaryContent = ({ linkedEntity, node }) => {
  const stageType = getBpmnStageType(node);
  const isOutOfMainPath = node?.outOfMainPath === true;

  const nodeDescricao = String(
    node?.subtitle ||
      node?.descricao ||
      node?.entidadeDescricao ||
      node?.entidadeResumo ||
      '',
  ).trim();
  const nodeAtributoChave = String(
    node?.info || node?.atributoChave || '',
  ).trim();

  const descricao = String(
    linkedEntity?.descricao ||
      (stageType === 'entidade' ? nodeDescricao : '') ||
      (stageType === 'task'
        ? node?.taskDescricao
        : node?.condicionalDescricao) ||
      '',
  ).trim();
  const atributoChave = String(
    resolveEntityAtributoChave(linkedEntity) ||
      (stageType === 'entidade' ? nodeAtributoChave : '') ||
      '',
  ).trim();

  const tipoEntidade = String(
    linkedEntity?.tipoEntidade ||
      (stageType === 'task'
        ? 'Atividade BPMN'
        : stageType === 'condicional'
          ? 'Decisão BPMN'
          : ''),
  ).trim();

  return [
    `Descrição: ${descricao || '-'}`,
    `Atributo chave: ${atributoChave || '-'}`,
    `Tipo da entidade: ${tipoEntidade || '-'}`,
    `Fluxo principal na pipeline: ${isOutOfMainPath ? 'não' : 'sim'}`,
  ].join('\n');
};

const buildTopicRowsFromBpmnEntities = (opportunity, entidadesCatalog = []) => {
  const bpmnStages = buildStagesFromBpmn(opportunity);

  const bpmnNodes = Array.isArray(opportunity?.bpmn?.nodes)
    ? opportunity.bpmn.nodes
    : [];
  const nodesById = new Map(bpmnNodes.map((node) => [String(node?.id), node]));

  const principalPathNodeIds = new Set(
    (Array.isArray(bpmnStages) ? bpmnStages : [])
      .map((stage) => String(stage?.sourceNodeId || '').trim())
      .filter(Boolean),
  );

  const offPathStages = bpmnNodes
    .filter(
      (node) =>
        node?.active !== false &&
        isBpmnStageNode(node) &&
        !principalPathNodeIds.has(String(node?.id || '').trim()),
    )
    .map((node, index) => ({
      id: `offpath-stage-${String(node?.id || index)}`,
      label: getStageLabelFromNode(node, index),
      sourceNodeId: String(node?.id || ''),
      stageType: getBpmnStageType(node),
      outOfMainPath: true,
    }));

  const topicStages = [
    ...(Array.isArray(bpmnStages) ? bpmnStages : []),
    ...offPathStages,
  ];

  if (topicStages.length === 0) return [];

  const entidadesById = new Map();
  const entidadesByName = new Map();
  (Array.isArray(entidadesCatalog) ? entidadesCatalog : []).forEach((item) => {
    const id = item?.id ?? item?._id;
    if (id !== null && id !== undefined && String(id).trim()) {
      entidadesById.set(String(id), item);
    }

    const nome = String(item?.nome || item?.name || item?.titulo || '').trim();
    const normalized = normalizeTopicLabel(nome);
    if (normalized) {
      entidadesByName.set(normalized, item);
    }
  });

  const seen = new Set();
  const rows = [];

  topicStages.forEach((stage) => {
    const label = String(stage?.label || '').trim();
    const normalized = normalizeTopicLabel(label);
    if (!normalized || seen.has(normalized)) return;

    const sourceNode = nodesById.get(String(stage?.sourceNodeId || '')) || null;
    const node = sourceNode
      ? {
          ...sourceNode,
          outOfMainPath: stage?.outOfMainPath === true,
        }
      : null;
    const nodeEntityId =
      node?.entidadeId !== null && node?.entidadeId !== undefined
        ? String(node.entidadeId)
        : '';
    const nodeEntityName = normalizeTopicLabel(node?.entidadeNome || label);

    const linkedEntity =
      (nodeEntityId ? entidadesById.get(nodeEntityId) : null) ||
      (nodeEntityName ? entidadesByName.get(nodeEntityName) : null) ||
      null;

    const value = buildEntitySummaryContent({
      linkedEntity,
      node,
    });

    seen.add(normalized);
    rows.push({
      label,
      value,
      sourceNodeId: String(stage?.sourceNodeId || ''),
      topicType: getTopicTypeFromStageType(stage?.stageType),
      isPrimaryEntity:
        stage?.stageType === 'entidade' && node?.isPrimaryEntity === true,
    });
  });

  return rows;
};

const mergeInfoRowsWithBpmnEntities = (
  sourceRows,
  opportunity,
  entidadesCatalog = [],
) => {
  const safeRows = Array.isArray(sourceRows) ? sourceRows : [];

  const titleRowSource = safeRows[0] || {};
  const titleRow = {
    label: String(titleRowSource.label || ''),
    value: String(titleRowSource.value || ''),
    topicType: normalizeTopicType(titleRowSource.topicType),
    isPrimaryEntity: titleRowSource?.isPrimaryEntity === true,
  };

  const contentRows = safeRows.slice(1).map((row) => ({
    label: String(row?.label || ''),
    value: String(row?.value || ''),
    sourceNodeId: String(row?.sourceNodeId || '').trim(),
    topicType: normalizeTopicType(row?.topicType),
    isPrimaryEntity: row?.isPrimaryEntity === true,
    manualStatus: normalizeManualTopicStatus(row?.manualStatus),
  }));

  const bpmnEntityRows = buildTopicRowsFromBpmnEntities(
    opportunity,
    entidadesCatalog,
  );
  if (bpmnEntityRows.length === 0) {
    return [titleRow, ...contentRows];
  }

  const existingByLabel = new Map(
    contentRows
      .map((row) => [normalizeTopicLabel(row.label), row])
      .filter(([normalized]) => Boolean(normalized)),
  );

  const existingBySourceNodeId = new Map(
    contentRows
      .map((row) => [String(row?.sourceNodeId || '').trim(), row])
      .filter(([sourceNodeId]) => Boolean(sourceNodeId)),
  );

  const mergedBpmnRows = bpmnEntityRows.map((row) => {
    const sourceNodeId = String(row?.sourceNodeId || '').trim();
    const normalized = normalizeTopicLabel(row.label);
    const existing =
      (sourceNodeId ? existingBySourceNodeId.get(sourceNodeId) : null) ||
      existingByLabel.get(normalized);
    if (!existing) return row;

    return {
      ...existing,
      value: row.value,
      sourceNodeId,
      topicType: normalizeTopicType(row.topicType),
      isPrimaryEntity: row?.isPrimaryEntity === true,
      manualStatus: 'pendente',
    };
  });

  const bpmnLabelSet = new Set(
    bpmnEntityRows.map((row) => normalizeTopicLabel(row.label)),
  );

  const extraManualRows = contentRows
    .filter((row) => {
      const sourceNodeId = String(row?.sourceNodeId || '').trim();
      if (sourceNodeId) return false;

      const normalized = normalizeTopicLabel(row?.label || '');
      if (!normalized) return true;

      return !bpmnLabelSet.has(normalized);
    })
    .map((row) => ({
      ...row,
      manualStatus: normalizeManualTopicStatus(row?.manualStatus),
    }));

  return [titleRow, ...mergedBpmnRows, ...extraManualRows];
};

const useOpportunityDetailState = ({
  opportunity,
  slug,
  owner,
  actorName,
  actorId,
  isReadOnlyMode = false,
}) => {
  const { entidades: entidadesRaw } = useContext(EntidadesContext);
  const entidadesCatalog = useMemo(
    () => (Array.isArray(entidadesRaw) ? entidadesRaw : []),
    [entidadesRaw],
  );

  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const [showPipeline, setShowPipeline] = useState(() =>
    getStoredVisibility(
      opportunity,
      'showPipeline',
      'layoutShowPipeline',
      true,
    ),
  );
  const [showTopico, setShowTopico] = useState(() =>
    getStoredVisibility(opportunity, 'showTopico', 'layoutShowTopico', false),
  );
  const [showTimeline, setShowTimeline] = useState(() =>
    getStoredVisibility(
      opportunity,
      'showTimeline',
      'layoutShowTimeline',
      true,
    ),
  );
  const [pipelineTitle, setPipelineTitle] = useState(() =>
    String(
      opportunity?.pipelineTitle || localStorage.getItem('pipelineTitle') || '',
    ),
  );
  const [pipelineSubtitle, setPipelineSubtitle] = useState(() =>
    String(
      opportunity?.pipelineSubtitle ||
        localStorage.getItem('pipelineSubtitle') ||
        '',
    ),
  );

  const [stages, setStages] = useState(() => {
    const bpmnStages = buildStagesFromBpmn(opportunity);
    if (bpmnStages.length > 0) return bpmnStages;

    return Array.isArray(opportunity?.stages) && opportunity.stages.length
      ? opportunity.stages
      : defaultStages;
  });
  const [title, setTitle] = useState(
    opportunity?.name || titleFromSlug(slug || ''),
  );
  const [infoRows, setInfoRows] = useState(
    mergeInfoRowsWithBpmnEntities(
      Array.isArray(opportunity?.infoRows) && opportunity.infoRows.length
        ? opportunity.infoRows
        : [{ label: '', value: '' }],
      opportunity,
      entidadesCatalog,
    ),
  );
  const [selectedOwner, setSelectedOwner] = useState(
    resolveSelectedOwner({
      opportunity,
      fallbackOwner: owner,
    }),
  );
  const [timelineItems, setTimelineItems] = useState(
    Array.isArray(opportunity?.timelineItems) &&
      opportunity.timelineItems.length
      ? opportunity.timelineItems
      : defaultTimelineItems,
  );
  const [editingTimelineItemId, setEditingTimelineItemId] = useState(null);
  const [timelineNoteTitle, setTimelineNoteTitle] = useState('');
  const [timelineNoteDescription, setTimelineNoteDescription] = useState('');
  const [manualStatus, setManualStatus] = useState(
    opportunity?.status || opportunity?.etapa || '',
  );
  const [manualStatusLocked, setManualStatusLocked] = useState(!showPipeline);
  const [createdDate, setCreatedDate] = useState(
    formatDateToDayMonthYear(opportunity?.createdDate || ''),
  );
  const [endDate, setEndDate] = useState(opportunity?.endDate || '');

  const opportunityId =
    opportunity?.id !== undefined && opportunity?.id !== null
      ? String(opportunity.id)
      : opportunity?._id !== undefined && opportunity?._id !== null
        ? String(opportunity._id)
        : '';

  const autoTimelineKeysRef = useRef(
    new Set(
      (Array.isArray(opportunity?.timelineItems)
        ? opportunity.timelineItems
        : []
      )
        .map((item) => String(item?.autoKey || '').trim())
        .filter(Boolean),
    ),
  );
  const hasInitializedAutoTrackingRef = useRef(false);

  const bpmnSignature = useMemo(
    () => safeStringify(opportunity?.bpmn || null),
    [opportunity?.bpmn],
  );

  const bpmnActivitySnapshot = useMemo(
    () => buildBpmnActivitySnapshot(opportunity),
    [opportunity],
  );

  const opportunitySignature = useMemo(
    () => buildOpportunitySignature(opportunity),
    [opportunity],
  );

  const opportunityCoreSnapshot = useMemo(
    () => buildOpportunityCoreSnapshot(opportunity),
    [opportunity],
  );

  const linkedEntitiesSnapshot = useMemo(
    () => getLinkedBpmnEntitiesSnapshot(opportunity, entidadesCatalog),
    [opportunity, entidadesCatalog],
  );

  const linkedEntitiesSignature = useMemo(
    () => safeStringify(linkedEntitiesSnapshot),
    [linkedEntitiesSnapshot],
  );

  const previousBpmnSignatureRef = useRef(bpmnSignature);
  const previousBpmnActivitySnapshotRef = useRef(bpmnActivitySnapshot);
  const previousOpportunitySignatureRef = useRef(opportunitySignature);
  const previousOpportunityCoreSnapshotRef = useRef(opportunityCoreSnapshot);
  const previousLinkedEntitiesSignatureRef = useRef(linkedEntitiesSignature);
  const previousLinkedEntitiesSnapshotRef = useRef(linkedEntitiesSnapshot);

  const resolvedActorName =
    String(actorName || owner || '').trim() || 'Conta atual';
  const resolvedActorId = String(actorId || '').trim() || '';

  const appendAutomaticTimelineNote = useCallback(
    ({
      autoKey,
      title,
      description,
      actionType = 'update',
      elementType = 'oportunidade',
      itemName,
      before = '',
      after = '',
      comment = '',
    }) => {
      const normalizedAutoKey = String(autoKey || '').trim();
      if (!normalizedAutoKey) return;
      if (autoTimelineKeysRef.current.has(normalizedAutoKey)) return;

      const timestamp = getCurrentTimelineTimestamp();

      const newItem = {
        id: Date.now(),
        title,
        description,
        time: getCurrentTimelineTime(),
        timestamp,
        actor: resolvedActorName,
        actorId: resolvedActorId,
        autoGenerated: true,
        autoKey: normalizedAutoKey,
        actionType,
        elementType,
        itemName: String(itemName || title || '').trim() || 'Registro',
        before,
        after,
        comment,
      };

      autoTimelineKeysRef.current.add(normalizedAutoKey);
      setTimelineItems((previous) => [newItem, ...previous]);
    },
    [resolvedActorId, resolvedActorName],
  );

  const appendEntityChangeNotes = useCallback(
    ({ previousEntities, nextEntities, scope }) => {
      const { created, updated, removed } = diffLinkedEntities(
        previousEntities,
        nextEntities,
      );

      created.forEach((entity) => {
        const entityName =
          String(entity?.nome || 'Entidade').trim() || 'Entidade';
        const entityKey = getEntitySnapshotKey(entity);

        appendAutomaticTimelineNote({
          autoKey: `entidade-criada:${scope}:${entityKey}:${buildEntityFingerprint(entity)}`,
          title: `Entidade criada no BPMN: ${entityName}`,
          description:
            'A entidade foi adicionada ao BPMN ativo e sincronizada automaticamente.',
          actionType: 'create',
          elementType: 'entidade',
          itemName: entityName,
          before: 'Inexistente',
          after: 'Criada no BPMN ativo',
        });
      });

      updated.forEach(({ previous, current }) => {
        const previousName = String(previous?.nome || '').trim();
        const currentName = String(current?.nome || '').trim();
        const label = currentName || previousName || 'Entidade';
        const currentFields = Array.isArray(current?.campos)
          ? current.campos
          : [];

        appendAutomaticTimelineNote({
          autoKey: `entidade-atualizada:${scope}:${getEntitySnapshotKey(current)}:${buildEntityFingerprint(current)}`,
          title: `Entidade atualizada no BPMN: ${label}`,
          description: `Atualização sincronizada automaticamente (campos: ${currentFields.length}, atributo chave: ${String(current?.atributoChave || '-').trim() || '-'}).`,
          actionType: 'update',
          elementType: 'entidade',
          itemName: label,
          before: 'Versão anterior',
          after: 'Versão atual sincronizada',
        });
      });

      removed.forEach((entity) => {
        const entityName =
          String(entity?.nome || 'Entidade').trim() || 'Entidade';

        appendAutomaticTimelineNote({
          autoKey: `entidade-removida:${scope}:${getEntitySnapshotKey(entity)}:${buildEntityFingerprint(entity)}`,
          title: `Entidade removida do BPMN: ${entityName}`,
          description:
            'A entidade deixou de estar vinculada ao BPMN ativo e foi atualizada automaticamente.',
          actionType: 'delete',
          elementType: 'entidade',
          itemName: entityName,
          before: 'Vinculada ao BPMN ativo',
          after: 'Removida da vinculação',
        });
      });
    },
    [appendAutomaticTimelineNote],
  );

  useEffect(() => {
    if (!hasInitializedAutoTrackingRef.current) {
      hasInitializedAutoTrackingRef.current = true;
      previousBpmnSignatureRef.current = bpmnSignature;
      previousBpmnActivitySnapshotRef.current = bpmnActivitySnapshot;
      previousOpportunitySignatureRef.current = opportunitySignature;
      previousOpportunityCoreSnapshotRef.current = opportunityCoreSnapshot;
      previousLinkedEntitiesSignatureRef.current = linkedEntitiesSignature;
      previousLinkedEntitiesSnapshotRef.current = linkedEntitiesSnapshot;
      return;
    }

    if (previousBpmnSignatureRef.current !== bpmnSignature) {
      const refreshedStages = buildStagesFromBpmn(opportunity);
      if (refreshedStages.length > 0) {
        window.setTimeout(() => {
          setStages(refreshedStages);
        }, 0);
      }

      window.setTimeout(() => {
        setInfoRows((previousRows) =>
          mergeInfoRowsWithBpmnEntities(
            previousRows,
            opportunity,
            entidadesCatalog,
          ),
        );
      }, 0);

      window.setTimeout(() => {
        const bpmnChanges = describeBpmnActivityChanges(
          previousBpmnActivitySnapshotRef.current,
          bpmnActivitySnapshot,
        );

        if (bpmnChanges.length > 0) {
          appendAutomaticTimelineNote({
            autoKey: `bpmn-resumo:${bpmnSignature}`,
            title: 'Estrutura do BPMN atualizada',
            description: bpmnChanges.join(' | '),
            actionType: 'update',
            elementType: 'bpmn',
            itemName: 'Estrutura BPMN',
            before: [
              `Nós: ${previousBpmnActivitySnapshotRef.current?.totalNodes || 0}`,
              `Conexões: ${
                previousBpmnActivitySnapshotRef.current?.totalConnections || 0
              }`,
            ].join(' | '),
            after: [
              `Nós: ${bpmnActivitySnapshot?.totalNodes || 0}`,
              `Conexões: ${bpmnActivitySnapshot?.totalConnections || 0}`,
            ].join(' | '),
            comment: bpmnChanges.join(' | '),
          });
        }

        if (
          previousBpmnActivitySnapshotRef.current?.mainPathLabels !==
          bpmnActivitySnapshot?.mainPathLabels
        ) {
          appendAutomaticTimelineNote({
            autoKey: `bpmn-trilha-principal:${bpmnSignature}`,
            title: 'Trilha principal do BPMN atualizada',
            description: `Antes: ${
              previousBpmnActivitySnapshotRef.current?.mainPathLabels || '-'
            } → Agora: ${bpmnActivitySnapshot?.mainPathLabels || '-'}`,
            actionType: 'update',
            elementType: 'pipeline',
            itemName: 'Trilha principal BPMN',
            before:
              previousBpmnActivitySnapshotRef.current?.mainPathLabels || '-',
            after: bpmnActivitySnapshot?.mainPathLabels || '-',
          });
        }

        appendAutomaticTimelineNote({
          autoKey: `bpmn:${bpmnSignature}`,
          title: 'BPMN ativo atualizado',
          description:
            'As alterações do BPMN ativo foram sincronizadas automaticamente nesta oportunidade.',
          actionType: 'update',
          elementType: 'bpmn',
          itemName: 'BPMN ativo',
          before: 'Versão anterior',
          after: 'Versão atual',
        });
      }, 0);

      previousBpmnSignatureRef.current = bpmnSignature;
      previousBpmnActivitySnapshotRef.current = bpmnActivitySnapshot;
    }

    if (previousOpportunitySignatureRef.current !== opportunitySignature) {
      window.setTimeout(() => {
        const opportunityChanges = describeOpportunityCoreChanges(
          previousOpportunityCoreSnapshotRef.current,
          opportunityCoreSnapshot,
        );

        opportunityChanges.forEach((change) => {
          appendAutomaticTimelineNote({
            autoKey: `oportunidade:${change.key}:${opportunitySignature}`,
            title: change.title,
            description: change.description,
            actionType: 'update',
            elementType: change.elementType,
            itemName: change.itemName,
            before: change.before,
            after: change.after,
          });
        });
      }, 0);

      previousOpportunitySignatureRef.current = opportunitySignature;
      previousOpportunityCoreSnapshotRef.current = opportunityCoreSnapshot;
    }

    if (
      previousLinkedEntitiesSignatureRef.current !== linkedEntitiesSignature
    ) {
      window.setTimeout(() => {
        setInfoRows((previousRows) =>
          mergeInfoRowsWithBpmnEntities(
            previousRows,
            opportunity,
            entidadesCatalog,
          ),
        );
      }, 0);

      window.setTimeout(() => {
        appendEntityChangeNotes({
          previousEntities: previousLinkedEntitiesSnapshotRef.current,
          nextEntities: linkedEntitiesSnapshot,
          scope: 'local',
        });
      }, 0);

      previousLinkedEntitiesSignatureRef.current = linkedEntitiesSignature;
      previousLinkedEntitiesSnapshotRef.current = linkedEntitiesSnapshot;
    }
  }, [
    appendAutomaticTimelineNote,
    appendEntityChangeNotes,
    bpmnSignature,
    bpmnActivitySnapshot,
    entidadesCatalog,
    linkedEntitiesSnapshot,
    linkedEntitiesSignature,
    opportunity,
    opportunityCoreSnapshot,
    opportunitySignature,
  ]);

  useEffect(() => {
    if (!opportunityId) return undefined;

    let isMounted = true;

    const syncExistingBpmnUpdates = async () => {
      try {
        const response = await fetchOpportunitiesPage({
          page: 1,
          limit: 200,
          token: getAuthToken(),
        });

        if (!isMounted) return;

        const rows = Array.isArray(response?.data) ? response.data : [];
        const freshOpportunity = rows.find((item) => {
          const idValue =
            item?.id !== undefined && item?.id !== null
              ? String(item.id)
              : item?._id !== undefined && item?._id !== null
                ? String(item._id)
                : '';
          return idValue && idValue === opportunityId;
        });

        if (!freshOpportunity) return;

        const remoteBpmnSignature = safeStringify(
          freshOpportunity?.bpmn || null,
        );
        const remoteOpportunitySignature =
          buildOpportunitySignature(freshOpportunity);
        const remoteOpportunityCoreSnapshot =
          buildOpportunityCoreSnapshot(freshOpportunity);
        const remoteBpmnActivitySnapshot =
          buildBpmnActivitySnapshot(freshOpportunity);
        const remoteLinkedEntitiesSnapshot = getLinkedBpmnEntitiesSnapshot(
          freshOpportunity,
          entidadesCatalog,
        );
        const remoteLinkedEntitiesSignature = safeStringify(
          remoteLinkedEntitiesSnapshot,
        );

        if (previousBpmnSignatureRef.current !== remoteBpmnSignature) {
          const refreshedStages = buildStagesFromBpmn(freshOpportunity);
          if (refreshedStages.length > 0) {
            setStages(refreshedStages);
          }

          setInfoRows((previousRows) =>
            mergeInfoRowsWithBpmnEntities(
              previousRows,
              freshOpportunity,
              entidadesCatalog,
            ),
          );

          window.setTimeout(() => {
            const bpmnChanges = describeBpmnActivityChanges(
              previousBpmnActivitySnapshotRef.current,
              remoteBpmnActivitySnapshot,
            );

            if (bpmnChanges.length > 0) {
              appendAutomaticTimelineNote({
                autoKey: `bpmn-resumo:remote:${remoteBpmnSignature}`,
                title: 'Estrutura do BPMN remoto atualizada',
                description: bpmnChanges.join(' | '),
                actionType: 'update',
                elementType: 'bpmn',
                itemName: 'Estrutura BPMN remota',
                before: [
                  `Nós: ${
                    previousBpmnActivitySnapshotRef.current?.totalNodes || 0
                  }`,
                  `Conexões: ${
                    previousBpmnActivitySnapshotRef.current?.totalConnections ||
                    0
                  }`,
                ].join(' | '),
                after: [
                  `Nós: ${remoteBpmnActivitySnapshot?.totalNodes || 0}`,
                  `Conexões: ${
                    remoteBpmnActivitySnapshot?.totalConnections || 0
                  }`,
                ].join(' | '),
                comment: bpmnChanges.join(' | '),
              });
            }

            if (
              previousBpmnActivitySnapshotRef.current?.mainPathLabels !==
              remoteBpmnActivitySnapshot?.mainPathLabels
            ) {
              appendAutomaticTimelineNote({
                autoKey: `bpmn-trilha-principal:remote:${remoteBpmnSignature}`,
                title: 'Trilha principal do BPMN remoto atualizada',
                description: `Antes: ${
                  previousBpmnActivitySnapshotRef.current?.mainPathLabels || '-'
                } → Agora: ${
                  remoteBpmnActivitySnapshot?.mainPathLabels || '-'
                }`,
                actionType: 'update',
                elementType: 'pipeline',
                itemName: 'Trilha principal BPMN remoto',
                before:
                  previousBpmnActivitySnapshotRef.current?.mainPathLabels ||
                  '-',
                after: remoteBpmnActivitySnapshot?.mainPathLabels || '-',
              });
            }

            appendAutomaticTimelineNote({
              autoKey: `bpmn:remote:${remoteBpmnSignature}`,
              title: 'BPMN já salvo atualizado',
              description:
                'Atualizações detectadas em um BPMN já existente foram aplicadas automaticamente.',
              actionType: 'update',
              elementType: 'bpmn',
              itemName: 'BPMN já salvo',
              before: 'Versão remota anterior',
              after: 'Versão remota atual',
            });
          }, 0);

          previousBpmnSignatureRef.current = remoteBpmnSignature;
          previousBpmnActivitySnapshotRef.current = remoteBpmnActivitySnapshot;
        }

        if (
          previousOpportunitySignatureRef.current !== remoteOpportunitySignature
        ) {
          setTitle(
            (previousTitle) =>
              String(
                freshOpportunity?.name || freshOpportunity?.nome || '',
              ).trim() || previousTitle,
          );
          setManualStatus(
            (previousManualStatus) =>
              String(
                freshOpportunity?.status || freshOpportunity?.etapa || '',
              ).trim() || previousManualStatus,
          );
          setCreatedDate(
            (previousCreatedDate) =>
              formatDateToDayMonthYear(
                freshOpportunity?.createdDate ||
                  freshOpportunity?.created_at ||
                  '',
              ) || previousCreatedDate,
          );
          setEndDate(
            (previousEndDate) =>
              String(freshOpportunity?.endDate || '').trim() || previousEndDate,
          );
          setSelectedOwner(
            resolveSelectedOwner({
              opportunity: freshOpportunity,
              fallbackOwner: owner,
            }),
          );

          window.setTimeout(() => {
            const opportunityChanges = describeOpportunityCoreChanges(
              previousOpportunityCoreSnapshotRef.current,
              remoteOpportunityCoreSnapshot,
            );

            opportunityChanges.forEach((change) => {
              appendAutomaticTimelineNote({
                autoKey: `oportunidade:remote:${change.key}:${remoteOpportunitySignature}`,
                title: change.title,
                description: change.description,
                actionType: 'update',
                elementType: change.elementType,
                itemName: change.itemName,
                before: change.before,
                after: change.after,
              });
            });
          }, 0);

          previousOpportunitySignatureRef.current = remoteOpportunitySignature;
          previousOpportunityCoreSnapshotRef.current =
            remoteOpportunityCoreSnapshot;
        }

        if (
          previousLinkedEntitiesSignatureRef.current !==
          remoteLinkedEntitiesSignature
        ) {
          setInfoRows((previousRows) =>
            mergeInfoRowsWithBpmnEntities(
              previousRows,
              freshOpportunity,
              entidadesCatalog,
            ),
          );

          window.setTimeout(() => {
            appendEntityChangeNotes({
              previousEntities: previousLinkedEntitiesSnapshotRef.current,
              nextEntities: remoteLinkedEntitiesSnapshot,
              scope: 'remote',
            });
          }, 0);

          previousLinkedEntitiesSignatureRef.current =
            remoteLinkedEntitiesSignature;
          previousLinkedEntitiesSnapshotRef.current =
            remoteLinkedEntitiesSnapshot;
        }
      } catch {
        // no-op: sync is best effort
      }
    };

    syncExistingBpmnUpdates();
    const intervalId = window.setInterval(syncExistingBpmnUpdates, 15000);

    const handleWindowFocus = () => {
      syncExistingBpmnUpdates();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncExistingBpmnUpdates();
      }
    };

    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [
    appendAutomaticTimelineNote,
    appendEntityChangeNotes,
    entidadesCatalog,
    opportunityId,
    owner,
  ]);

  const status = useMemo(() => {
    const doneCount = stages.filter((stage) => stage.done).length;
    const defaultStatus =
      stages.length > 0 && doneCount === stages.length
        ? 'Finalizado'
        : doneCount <= 1
          ? 'Iniciando'
          : 'Em Andamento';

    const stageStatus = [...stages]
      .reverse()
      .find((stage) => stage.done && stage.label?.trim())?.label;

    return stageStatus || defaultStatus;
  }, [stages]);

  const isBpmnDrivenPipeline = useMemo(
    () => stages.some((stage) => stage?.fromBpmn === true),
    [stages],
  );

  const currentBpmnStageName = useMemo(() => {
    if (!isBpmnDrivenPipeline) return '';

    const currentStage = [...stages]
      .reverse()
      .find(
        (stage) => stage?.done === true && String(stage?.label || '').trim(),
      );

    if (currentStage?.label) {
      return String(currentStage.label).trim();
    }

    const firstLabeledStage = stages.find((stage) =>
      String(stage?.label || '').trim(),
    );
    return String(firstLabeledStage?.label || '').trim();
  }, [isBpmnDrivenPipeline, stages]);

  const effectiveStatus = isBpmnDrivenPipeline
    ? currentBpmnStageName || status
    : manualStatusLocked
      ? manualStatus.trim() || status
      : showPipeline
        ? status
        : manualStatus.trim() || status;

  const toggleEditing = () => {
    if (isReadOnlyMode) return;
    if (isEditing && showPipeline) {
      setManualStatusLocked(false);
    }
    setIsEditing(!isEditing);
  };

  const togglePipeline = () => {
    if (isReadOnlyMode) return;
    const newValue = !showPipeline;
    if (!newValue && !manualStatus.trim()) {
      setManualStatus(status);
    }
    if (!newValue) {
      setManualStatusLocked(true);
    }
    setShowPipeline(newValue);
    localStorage.setItem('layoutShowPipeline', JSON.stringify(newValue));
  };

  const toggleTopico = () => {
    if (isReadOnlyMode) return;
    const newValue = !showTopico;
    setShowTopico(newValue);
    localStorage.setItem('layoutShowTopico', JSON.stringify(newValue));
  };

  const toggleTimeline = () => {
    if (isReadOnlyMode) return;
    const newValue = !showTimeline;
    setShowTimeline(newValue);
    localStorage.setItem('layoutShowTimeline', JSON.stringify(newValue));
  };

  useEffect(() => {
    localStorage.setItem('pipelineTitle', String(pipelineTitle || ''));
  }, [pipelineTitle]);

  useEffect(() => {
    localStorage.setItem('pipelineSubtitle', String(pipelineSubtitle || ''));
  }, [pipelineSubtitle]);

  const handleAddTimelineItem = () => {
    if (isReadOnlyMode) return;
    const noteTitle = timelineNoteTitle.trim();
    const noteDescription = timelineNoteDescription.trim();
    const timestamp = getCurrentTimelineTimestamp();

    const newItem = {
      id: Date.now(),
      title: noteTitle || 'Novo evento',
      description: noteDescription || 'Descreva este evento...',
      time: getCurrentTimelineTime(),
      timestamp,
      actor: resolvedActorName,
      actorId: resolvedActorId,
      actionType: 'comment',
      elementType: 'observacao',
      itemName: noteTitle || 'Novo evento',
      before: '',
      after: '',
      comment: noteDescription || '',
      source: 'manual-note',
    };

    setTimelineItems((prev) => [newItem, ...prev]);
    setTimelineNoteTitle('');
    setTimelineNoteDescription('');
  };

  const updateTimelineItem = (id, field, value) => {
    if (isReadOnlyMode) return;
    setTimelineItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    );
  };

  const removeTimelineItem = (id) => {
    if (isReadOnlyMode) return;
    setTimelineItems((prev) => prev.filter((item) => item.id !== id));
    if (editingTimelineItemId === id) {
      setEditingTimelineItemId(null);
    }
  };

  return {
    deleteConfirm,
    setDeleteConfirm,
    isEditing,
    showPipeline,
    showTopico,
    showTimeline,
    pipelineTitle,
    setPipelineTitle,
    pipelineSubtitle,
    setPipelineSubtitle,
    stages,
    setStages,
    title,
    setTitle,
    infoRows,
    setInfoRows,
    selectedOwner,
    setSelectedOwner,
    timelineItems,
    editingTimelineItemId,
    setEditingTimelineItemId,
    timelineNoteTitle,
    setTimelineNoteTitle,
    timelineNoteDescription,
    setTimelineNoteDescription,
    manualStatus,
    setManualStatus,
    createdDate,
    setCreatedDate,
    endDate,
    setEndDate,
    effectiveStatus,
    isBpmnDrivenPipeline,
    currentBpmnStageName,
    bpmnActivitySnapshot,
    toggleEditing,
    togglePipeline,
    toggleTopico,
    toggleTimeline,
    handleAddTimelineItem,
    updateTimelineItem,
    removeTimelineItem,
  };
};

export default useOpportunityDetailState;
