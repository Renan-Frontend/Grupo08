import React from 'react';
import ConfigurarEntidadePanel from '../configurar/ConfigurarEntidadePanel';
import {
  GATEWAY_TYPE_OPTIONS,
  getEntidadeNome,
} from '../gerarBpmnCreate.shared';
import styles from './GerarBPMNContextSidebar.module.css';

const GerarBPMNContextSidebar = ({
  className = '',
  isMobileMenu = false,
  shouldHideProperties,
  sidebarTabs,
  activeSidebarTab,
  setActiveSidebarTab,
  selectedNode,
  selectedConnection,
  selectedNodeTypeSelectorValue,
  selectedNodeIsPrimaryEntity,
  selectedNodeEntityType,
  onSetSelectedNodeAsPrimaryEntity,
  onSetSelectedNodeEntityType,
  handleChangeSelectedNodeType,
  sidebarConnectionDecisionDraft,
  setSidebarConnectionDecisionDraft,
  selectedConnectionSourceNode,
  selectedConnectionTargetNode,
  selectedConnectionId,
  handleUpdateSelectedConnectionDecision,
  removeSelectedConnection,
  taskForm,
  setTaskForm,
  gatewayTypeDraft,
  setGatewayTypeDraft,
  handleSaveGatewayType,
  stageConfigMode,
  setStageConfigMode,
  entityMode,
  setEntityMode,
  selectedExistingEntityId,
  setSelectedExistingEntityId,
  entityOptions,
  newEntityForm,
  setNewEntityForm,
  conditionalForm,
  setConditionalForm,
  isConditionalStageMode,
  entityFieldDraft,
  setEntityFieldDraft,
  newEntityFields,
  entityError,
  shouldShowSidebarPrimaryAction,
  handleSidebarPrimaryAction,
  isSidebarPrimaryActionDisabled,
  suggestedEntity,
  isDuplicateSuggestion,
  isEntitySuggestionBusy,
  handleEditSuggestedEntity,
  handleDeleteSuggestedEntity,
  entitySavedNotice,
  tutorialTargetId,
  isReadOnlyMode = false,
}) => {
  const [isMobileCollapsed, setIsMobileCollapsed] =
    React.useState(isMobileMenu);

  React.useEffect(() => {
    if (!isMobileMenu) {
      setIsMobileCollapsed(false);
    }
  }, [isMobileMenu]);

  React.useEffect(() => {
    if (!isMobileMenu) return;
    if (selectedNode || selectedConnection) {
      setIsMobileCollapsed(false);
    }
  }, [isMobileMenu, selectedConnection, selectedNode]);

  const shouldRenderExpandedContent = !isMobileMenu || !isMobileCollapsed;

  if (shouldHideProperties) return null;

  const entityPanelStageMode =
    selectedNodeTypeSelectorValue === 'condicional'
      ? 'condicional'
      : 'entidade';

  const mobileStepHint =
    activeSidebarTab === 'connection'
      ? 'Passo 1: selecione a conexão • Passo 2: defina a condição'
      : 'Passo 1: selecione a categoria • Passo 2: configure a etapa';

  const sidebarPanel = (
    <aside
      className={`${styles.sidebar} ${isMobileMenu ? styles.sidebarMobileMenu : ''} ${
        isMobileCollapsed ? styles.sidebarCollapsed : ''
      } ${!isMobileMenu ? className : ''}`}
      data-tutorial-id={tutorialTargetId}
    >
      {isMobileMenu ? (
        <div className={styles.mobilePopupHeader}>
          <h3 className={styles.mobileCompactTitle}>Painel contextual</h3>
          <button
            type="button"
            className={styles.mobileCollapseButton}
            onClick={() => setIsMobileCollapsed(true)}
            aria-label="Fechar painel"
            title="Fechar painel"
          >
            ✕
          </button>
        </div>
      ) : null}

      {isMobileMenu ? (
        <p className={styles.mobileStepHint}>{mobileStepHint}</p>
      ) : null}

      {shouldRenderExpandedContent ? (
        <div className={styles.sidebarTop}>
          {!isMobileMenu ? (
            <h3 className={styles.sidebarSectionTitle}>Painel contextual</h3>
          ) : null}

          {sidebarTabs.length > 1 ? (
            <div className={styles.sidebarTabs}>
              {sidebarTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`${styles.sidebarTabButton} ${
                    activeSidebarTab === tab.id
                      ? styles.sidebarTabButtonActive
                      : ''
                  }`}
                  onClick={() => setActiveSidebarTab(tab.id)}
                  disabled={isReadOnlyMode}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          ) : null}

          {selectedNode && !selectedConnection ? (
            <div className={styles.contextPanel}>
              {isMobileMenu &&
              activeSidebarTab === 'entidade' &&
              selectedNodeTypeSelectorValue === 'entidade' ? (
                <div className={styles.mobileDualFieldRow}>
                  <div className={styles.mobileFieldGroup}>
                    <p className={styles.contextPanelTitle}>
                      Categoria da etapa
                    </p>
                    <select
                      className={styles.nameInput}
                      data-tutorial-id="sidebar-stage-category"
                      value={selectedNodeTypeSelectorValue}
                      onChange={(event) =>
                        handleChangeSelectedNodeType(event.target.value)
                      }
                      disabled={isReadOnlyMode}
                      title="Categoria da etapa"
                    >
                      <option value="entidade">Dados</option>
                      <option value="task">Atividade</option>
                      <option value="condicional">Decisão</option>
                    </select>
                  </div>

                  <div className={styles.mobileFieldGroup}>
                    <p className={styles.contextPanelTitle}>Tipo da entidade</p>
                    <select
                      className={styles.nameInput}
                      value={selectedNodeEntityType || 'apoio'}
                      onChange={(event) =>
                        onSetSelectedNodeEntityType(event.target.value)
                      }
                      disabled={isReadOnlyMode}
                      title="Tipo da entidade"
                    >
                      <option value="principal">Principal</option>
                      <option value="apoio">Apoio</option>
                      <option value="associativa">Associativa</option>
                      <option value="externa">Externa</option>
                    </select>
                  </div>
                </div>
              ) : (
                <>
                  <p className={styles.contextPanelTitle}>Categoria da etapa</p>
                  <select
                    className={styles.nameInput}
                    data-tutorial-id="sidebar-stage-category"
                    value={selectedNodeTypeSelectorValue}
                    onChange={(event) =>
                      handleChangeSelectedNodeType(event.target.value)
                    }
                    disabled={isReadOnlyMode}
                    title="Categoria da etapa"
                  >
                    <option value="entidade">Dados</option>
                    <option value="task">Atividade</option>
                    <option value="condicional">Decisão</option>
                  </select>

                  {activeSidebarTab === 'entidade' &&
                  selectedNodeTypeSelectorValue === 'entidade' ? (
                    <>
                      <p className={styles.contextPanelTitle}>
                        Tipo da entidade
                      </p>
                      <select
                        className={styles.nameInput}
                        value={selectedNodeEntityType || 'apoio'}
                        onChange={(event) =>
                          onSetSelectedNodeEntityType(event.target.value)
                        }
                        disabled={isReadOnlyMode}
                        title="Tipo da entidade"
                      >
                        <option value="principal">Principal</option>
                        <option value="apoio">Apoio</option>
                        <option value="associativa">Associativa</option>
                        <option value="externa">Externa</option>
                      </select>
                    </>
                  ) : null}
                </>
              )}

              {activeSidebarTab === 'entidade' &&
              selectedNodeTypeSelectorValue === 'entidade' ? (
                <p className={styles.contextPanelDescription}>
                  Papel atual:{' '}
                  {selectedNodeIsPrimaryEntity ? 'Primária' : 'Secundária'}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {shouldRenderExpandedContent ? (
        <div
          className={styles.sidebarBody}
          data-tutorial-id="sidebar-config-area"
        >
          {activeSidebarTab === 'connection' ? (
            <div className={styles.contextPanel}>
              <p className={styles.contextPanelTitle}>Condição da conexão</p>
              <p className={styles.contextPanelDescription}>
                <strong>De:</strong>{' '}
                {String(
                  selectedConnectionSourceNode?.label ||
                    selectedConnectionSourceNode?.entidadeNome ||
                    selectedConnectionSourceNode?.condicionalNome ||
                    selectedConnectionSourceNode?.id ||
                    '-',
                )}
                {'  '}
                <strong>Para:</strong>{' '}
                {String(
                  selectedConnectionTargetNode?.label ||
                    selectedConnectionTargetNode?.entidadeNome ||
                    selectedConnectionTargetNode?.condicionalNome ||
                    selectedConnectionTargetNode?.id ||
                    '-',
                )}
              </p>
              <input
                className={styles.nameInput}
                value={sidebarConnectionDecisionDraft}
                onChange={(event) =>
                  setSidebarConnectionDecisionDraft(event.target.value)
                }
                disabled={isReadOnlyMode}
                placeholder="Condição (ex.: valor > 1000)"
                title="Condição da conexão"
              />
              <div className={styles.contextPanelActions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setSidebarConnectionDecisionDraft('sim')}
                  disabled={isReadOnlyMode}
                >
                  Sim
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setSidebarConnectionDecisionDraft('nao')}
                  disabled={isReadOnlyMode}
                >
                  Não
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setSidebarConnectionDecisionDraft('')}
                  disabled={isReadOnlyMode}
                >
                  Limpar
                </button>
              </div>
              <div className={styles.contextPanelActions}>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() =>
                    handleUpdateSelectedConnectionDecision(
                      String(sidebarConnectionDecisionDraft || '').trim(),
                    )
                  }
                  disabled={isReadOnlyMode || !selectedConnectionId}
                >
                  Salvar condição
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={removeSelectedConnection}
                  disabled={isReadOnlyMode || !selectedConnectionId}
                >
                  Remover conexão
                </button>
              </div>
            </div>
          ) : activeSidebarTab === 'entidade' &&
            selectedNodeTypeSelectorValue === 'task' ? (
            <div className={styles.contextPanel}>
              <p className={styles.contextPanelTitle}>
                Configuração da atividade
              </p>
              <input
                className={styles.nameInput}
                value={taskForm.nome}
                onChange={(event) =>
                  setTaskForm((previous) => ({
                    ...previous,
                    nome: event.target.value,
                  }))
                }
                disabled={isReadOnlyMode}
                placeholder="Nome da atividade"
                title="Nome da atividade"
              />
              <textarea
                className={styles.contextPanelTextarea}
                value={taskForm.descricao}
                onChange={(event) =>
                  setTaskForm((previous) => ({
                    ...previous,
                    descricao: event.target.value,
                  }))
                }
                disabled={isReadOnlyMode}
                placeholder="Descrição da atividade"
                title="Descrição da atividade"
              />
            </div>
          ) : activeSidebarTab === 'gateway' ? (
            <>
              <div className={styles.contextPanel}>
                <p className={styles.contextPanelTitle}>Tipo da decisão</p>
                <select
                  className={styles.nameInput}
                  value={gatewayTypeDraft}
                  onChange={(event) => setGatewayTypeDraft(event.target.value)}
                  disabled={isReadOnlyMode}
                  title="Tipo da decisão"
                >
                  {GATEWAY_TYPE_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={handleSaveGatewayType}
                  disabled={isReadOnlyMode}
                >
                  Salvar tipo
                </button>
              </div>
              <ConfigurarEntidadePanel
                selectedNode={selectedNode}
                stageConfigMode={stageConfigMode}
                setStageConfigMode={setStageConfigMode}
                stageModeLockedTo="condicional"
                entityMode={entityMode}
                setEntityMode={setEntityMode}
                selectedExistingEntityId={selectedExistingEntityId}
                setSelectedExistingEntityId={setSelectedExistingEntityId}
                entityOptions={entityOptions}
                newEntityForm={newEntityForm}
                setNewEntityForm={setNewEntityForm}
                conditionalForm={conditionalForm}
                setConditionalForm={setConditionalForm}
                newEntityFields={newEntityFields}
                onBeforeNavigateToEntityFields={handleSidebarPrimaryAction}
                isReadOnlyMode={isReadOnlyMode}
              />
            </>
          ) : activeSidebarTab === 'entidade' ? (
            <>
              <ConfigurarEntidadePanel
                selectedNode={selectedNode}
                stageConfigMode={stageConfigMode}
                setStageConfigMode={setStageConfigMode}
                stageModeLockedTo={entityPanelStageMode}
                entityMode={entityMode}
                setEntityMode={setEntityMode}
                selectedExistingEntityId={selectedExistingEntityId}
                setSelectedExistingEntityId={setSelectedExistingEntityId}
                entityOptions={entityOptions}
                newEntityForm={newEntityForm}
                setNewEntityForm={setNewEntityForm}
                conditionalForm={conditionalForm}
                setConditionalForm={setConditionalForm}
                newEntityFields={newEntityFields}
                onBeforeNavigateToEntityFields={handleSidebarPrimaryAction}
                isReadOnlyMode={isReadOnlyMode}
              />
            </>
          ) : (
            <div className={styles.contextPanel}>
              <p className={styles.contextPanelTitle}>Conexões da decisão</p>
              <p className={styles.contextPanelDescription}>
                Selecione uma conexão para editar a condição (Sim ou Não) no
                painel contextual de Conexão.
              </p>
            </div>
          )}
        </div>
      ) : null}

      {shouldRenderExpandedContent ? (
        <div className={styles.sidebarFooter}>
          {shouldShowSidebarPrimaryAction && !isReadOnlyMode ? (
            <button
              type="button"
              data-tutorial-id="sidebar-save-button"
              className={`${styles.primaryButton} ${styles.sidebarEntityActionButton}`}
              onClick={handleSidebarPrimaryAction}
              disabled={isSidebarPrimaryActionDisabled}
            >
              Salvar alterações
            </button>
          ) : null}
          {shouldShowSidebarPrimaryAction && entityError ? (
            <p className={styles.entityErrorMessage}>{entityError}</p>
          ) : null}
          {shouldShowSidebarPrimaryAction && suggestedEntity ? (
            <div className={styles.entitySuggestionCard}>
              <p className={styles.entitySuggestionTitle}>
                {isDuplicateSuggestion
                  ? 'Entidade já existente'
                  : 'Entidade selecionada'}
              </p>
              <p className={styles.entitySuggestionLine}>
                <strong>Nome:</strong> {getEntidadeNome(suggestedEntity) || '-'}
              </p>
              <p className={styles.entitySuggestionLine}>
                <strong>Descrição:</strong>{' '}
                {String(suggestedEntity?.descricao || '').trim() || '-'}
              </p>
              <div className={styles.entitySuggestionActions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={handleEditSuggestedEntity}
                  disabled={isReadOnlyMode || isEntitySuggestionBusy}
                >
                  Editar
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={handleDeleteSuggestedEntity}
                  disabled={isReadOnlyMode || isEntitySuggestionBusy}
                >
                  {isEntitySuggestionBusy ? 'Apagando...' : 'Apagar'}
                </button>
              </div>
            </div>
          ) : null}
          {entitySavedNotice ? (
            <p className={styles.entitySavedMessage}>{entitySavedNotice}</p>
          ) : null}
        </div>
      ) : null}
    </aside>
  );

  if (!isMobileMenu) {
    return sidebarPanel;
  }

  return (
    <div className={`${styles.mobilePopupRoot} ${className}`}>
      <div className={styles.mobileCompactBar}>
        <h3 className={styles.mobileCompactTitle}>Painel contextual</h3>
        <button
          type="button"
          className={styles.mobileCollapseButton}
          onClick={() => setIsMobileCollapsed((previous) => !previous)}
          aria-expanded={!isMobileCollapsed}
          aria-label={isMobileCollapsed ? 'Abrir painel' : 'Fechar painel'}
          title={isMobileCollapsed ? 'Abrir painel' : 'Fechar painel'}
        >
          {isMobileCollapsed ? 'Abrir' : 'Fechar'}
        </button>
      </div>

      {!isMobileCollapsed ? (
        <div
          className={styles.mobilePopupOverlay}
          onClick={() => setIsMobileCollapsed(true)}
        >
          <div
            className={styles.mobilePopupCardWrap}
            onClick={(event) => event.stopPropagation()}
          >
            {sidebarPanel}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default GerarBPMNContextSidebar;
