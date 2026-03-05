import React from 'react';
import {
  fetchOpportunitiesPage,
  getAuthToken,
  updateOpportunityById,
} from '../Components/Opportunities/opportunityApi';
import { BPMN_STAGES } from '../Components/GerarBPMN/bpmnStages';

export const useBpmnOpportunities = () => {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [opportunities, setOpportunities] = React.useState([]);

  React.useEffect(() => {
    let isMounted = true;

    async function loadOpportunities() {
      setLoading(true);
      setError('');

      try {
        const json = await fetchOpportunitiesPage({
          page: 1,
          limit: 100,
          token: getAuthToken(),
        });

        const data = Array.isArray(json?.data) ? json.data : [];
        if (!isMounted) return;
        setOpportunities(data);
      } catch (fetchError) {
        if (!isMounted) return;
        setError(fetchError.message || 'Erro ao carregar oportunidades.');
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadOpportunities();

    return () => {
      isMounted = false;
    };
  }, []);

  const updateOpportunityData = async ({ selectedOpportunity, patch }) => {
    if (!selectedOpportunity || saving) return;
    const optimistic = {
      ...selectedOpportunity,
      ...patch,
    };

    setOpportunities((prev) =>
      prev.map((item) => (item.id === optimistic.id ? optimistic : item)),
    );

    try {
      setSaving(true);
      setError('');

      const updated = await updateOpportunityById({
        opportunityId: selectedOpportunity.id,
        payload: optimistic,
        token: getAuthToken(),
      });

      setOpportunities((prev) =>
        prev.map((item) =>
          item.id === selectedOpportunity.id
            ? { ...optimistic, ...updated }
            : item,
        ),
      );
    } catch (updateError) {
      setError(updateError.message || 'Não foi possível atualizar a etapa.');
      setOpportunities((prev) =>
        prev.map((item) =>
          item.id === selectedOpportunity.id ? selectedOpportunity : item,
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  const updateOpportunityStage = async ({
    selectedOpportunity,
    nextStageIndex,
  }) => {
    const nextStage = BPMN_STAGES[nextStageIndex];

    await updateOpportunityData({
      selectedOpportunity,
      patch: {
        status: nextStage,
        stageIndex: nextStageIndex,
      },
    });
  };

  const addOpportunity = (opportunity) => {
    if (!opportunity?.id) return;

    setOpportunities((prev) => {
      const exists = prev.some(
        (item) => String(item.id) === String(opportunity.id),
      );
      if (exists) {
        return prev.map((item) =>
          String(item.id) === String(opportunity.id)
            ? { ...item, ...opportunity }
            : item,
        );
      }

      return [opportunity, ...prev];
    });
  };

  const removeOpportunity = (opportunityId) => {
    if (!opportunityId) return;
    setOpportunities((prev) =>
      prev.filter((item) => String(item.id) !== String(opportunityId)),
    );
  };

  return {
    loading,
    saving,
    error,
    opportunities,
    addOpportunity,
    removeOpportunity,
    updateOpportunityData,
    updateOpportunityStage,
  };
};
