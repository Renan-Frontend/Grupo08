/*
  EXEMPLOS PRÁTICOS DE USO - EditablePipeline
  =============================================
  
  Vários cenários de uso do componente EditablePipeline
  com diferentes configurações e integrações.
*/

// ============================================
// EXEMPLO 1: Uso Básico (Sem Persistência)
// ============================================
import React from 'react';
import EditablePipeline from './Components/Opportunities/EditablePipeline';

const BasicExample = () => {
  const stagesData = [
    { id: 1, label: 'Prospecting', done: false },
    { id: 2, label: 'Qualification', done: true },
    { id: 3, label: 'Presentation', done: false },
    { id: 4, label: 'Negotiation', done: false },
    { id: 5, label: 'Closed Won', done: false },
  ];

  return (
    <div>
      <h2>Sales Pipeline</h2>
      <EditablePipeline
        initialStages={stagesData}
        title="Enterprise Sales Pipeline"
        subtitle="12 Month Cycle"
      />
    </div>
  );
};

// ============================================
// EXEMPLO 2: Com Estado Controlado e Callback
// ============================================
const ControlledExample = () => {
  const [stages, setStages] = React.useState([
    { id: 1, label: 'Planning', done: true },
    { id: 2, label: 'Design', done: true },
    { id: 3, label: 'Development', done: false },
    { id: 4, label: 'Testing', done: false },
    { id: 5, label: 'Deployment', done: false },
  ]);

  const handleSave = (updatedStages) => {
    console.log('Pipeline updated:', updatedStages);
    setStages(updatedStages);
    // Aqui você poderia fazer uma chamada API
  };

  return (
    <div>
      <h2>Project Phases</h2>
      <EditablePipeline
        initialStages={stages}
        onSave={handleSave}
        title="Website Redesign Project"
        subtitle="Q1 2026 Initiative"
      />
      <div style={{ marginTop: '2rem' }}>
        <h3>Current Stages:</h3>
        <pre>{JSON.stringify(stages, null, 2)}</pre>
      </div>
    </div>
  );
};

// ============================================
// EXEMPLO 3: Integração com API Backend
// ============================================
const APIIntegrationExample = () => {
  const [stages, setStages] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const opportunityId = '123'; // Do URL params

  React.useEffect(() => {
    // Carregar de uma API
    const fetchPipeline = async () => {
      try {
        const response = await fetch(
          `/api/opportunities/${opportunityId}/pipeline`,
        );
        if (!response.ok) throw new Error('Failed to fetch');
        const data = await response.json();
        setStages(data.stages);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchPipeline();
  }, [opportunityId]);

  const handleSavePipeline = async (updatedStages) => {
    try {
      const response = await fetch(
        `/api/opportunities/${opportunityId}/pipeline`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stages: updatedStages }),
        },
      );

      if (!response.ok) throw new Error('Failed to save');

      const result = await response.json();
      setStages(result.stages);
      alert('Pipeline saved successfully!');
    } catch (err) {
      alert(`Error saving pipeline: ${err.message}`);
    }
  };

  if (loading) return <div>Loading pipeline...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <h2>Sales Opportunity #123</h2>
      <EditablePipeline
        initialStages={stages}
        onSave={handleSavePipeline}
        title="Enterprise Sales Process"
        subtitle="6 Month Cycle"
      />
    </div>
  );
};

// ============================================
// EXEMPLO 4: Com Contexto Global (Context API)
// ============================================
import { useContext } from 'react';

// Supondo que você tenha um OpportunitiesContext
const ContextExample = () => {
  const { opportunity, updateOpportunityStagess } =
    useContext(OpportunitiesContext);

  const handleSave = (updatedStages) => {
    updateOpportunityStagess(opportunity.id, updatedStages);
  };

  return (
    <div>
      <h2>{opportunity.name}</h2>
      <EditablePipeline
        initialStages={opportunity.stages}
        onSave={handleSave}
        title={opportunity.processName}
        subtitle={opportunity.processSubtitle}
      />
    </div>
  );
};

// ============================================
// EXEMPLO 5: Múltiplos Pipelines na Mesma Página
// ============================================
const MultiplePipelinesExample = () => {
  const [pipelines, setPipelines] = React.useState({
    sales: [
      { id: 1, label: 'Lead', done: true },
      { id: 2, label: 'Qualified', done: true },
      { id: 3, label: 'Proposal', done: false },
      { id: 4, label: 'Closed', done: false },
    ],
    support: [
      { id: 1, label: 'Ticket Created', done: true },
      { id: 2, label: 'Assigned', done: true },
      { id: 3, label: 'In Progress', done: false },
      { id: 4, label: 'Resolved', done: false },
    ],
  });

  const handleSaleSave = (updated) => {
    setPipelines((prev) => ({ ...prev, sales: updated }));
  };

  const handleSupportSave = (updated) => {
    setPipelines((prev) => ({ ...prev, support: updated }));
  };

  return (
    <div style={{ display: 'grid', gap: '2rem' }}>
      <div>
        <h2>Sales Pipeline</h2>
        <EditablePipeline
          initialStages={pipelines.sales}
          onSave={handleSaleSave}
          title="Sales Process"
          subtitle="3 Month Cycle"
        />
      </div>

      <div>
        <h2>Support Pipeline</h2>
        <EditablePipeline
          initialStages={pipelines.support}
          onSave={handleSupportSave}
          title="Support Process"
          subtitle="Continuous"
        />
      </div>
    </div>
  );
};

// ============================================
// EXEMPLO 6: Com Validação e Tratamento de Erro
// ============================================
const ValidatedExample = () => {
  const [stages, setStages] = React.useState([
    { id: 1, label: 'Step 1', done: true },
    { id: 2, label: 'Step 2', done: false },
  ]);

  const [saveStatus, setSaveStatus] = React.useState(null); // 'saving' | 'success' | 'error'

  const handleSave = async (updatedStages) => {
    // Validar
    if (updatedStages.length === 0) {
      alert('Pipeline must have at least one stage!');
      return;
    }

    // Verificar duplicatas
    const labels = updatedStages.map((s) => s.label);
    if (new Set(labels).size !== labels.length) {
      alert('Duplicate stage names are not allowed!');
      return;
    }

    setSaveStatus('saving');

    try {
      // Simular API delay
      await new Promise((resolve) => setTimeout(resolve, 1000));

      setStages(updatedStages);
      setSaveStatus('success');

      setTimeout(() => setSaveStatus(null), 3000);
    } catch (error) {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

  return (
    <div>
      <h2>Validated Pipeline</h2>
      <EditablePipeline
        initialStages={stages}
        onSave={handleSave}
        title="Process with Validation"
        subtitle="Quality Assured"
      />

      {saveStatus && (
        <div
          style={{
            marginTop: '1rem',
            padding: '1rem',
            borderRadius: '0.4rem',
            backgroundColor: saveStatus === 'success' ? '#d4edda' : '#f8d7da',
            color: saveStatus === 'success' ? '#155724' : '#721c24',
          }}
        >
          {saveStatus === 'saving' && 'Saving...'}
          {saveStatus === 'success' && '✓ Pipeline saved successfully!'}
          {saveStatus === 'error' &&
            '✗ Error saving pipeline. Please try again.'}
        </div>
      )}
    </div>
  );
};

// ============================================
// EXEMPLO 7: Customização Avançada
// ============================================
const AdvancedExample = () => {
  const pipelineTemplates = {
    sales: [
      { id: 1, label: 'Prospecting', done: false },
      { id: 2, label: 'Qualification', done: false },
      { id: 3, label: 'Proposal', done: false },
      { id: 4, label: 'Negotiation', done: false },
      { id: 5, label: 'Closed Won', done: false },
    ],
    support: [
      { id: 1, label: 'New', done: false },
      { id: 2, label: 'In Progress', done: false },
      { id: 3, label: 'Waiting', done: false },
      { id: 4, label: 'Resolved', done: false },
    ],
    custom: [],
  };

  const [selectedTemplate, setSelectedTemplate] = React.useState('sales');
  const [stages, setStages] = React.useState(pipelineTemplates.sales);

  const handleTemplateChange = (template) => {
    setSelectedTemplate(template);
    setStages(pipelineTemplates[template]);
  };

  return (
    <div>
      <h2>Pipeline Builder</h2>

      <div style={{ marginBottom: '2rem' }}>
        <label>Select Template: </label>
        {Object.keys(pipelineTemplates).map((key) => (
          <button
            key={key}
            onClick={() => handleTemplateChange(key)}
            style={{
              marginLeft: '1rem',
              padding: '0.5rem 1rem',
              backgroundColor: selectedTemplate === key ? '#2fb36d' : '#e5e9ee',
              color: selectedTemplate === key ? 'white' : '#66707a',
              border: 'none',
              borderRadius: '0.3rem',
              cursor: 'pointer',
            }}
          >
            {key.charAt(0).toUpperCase() + key.slice(1)}
          </button>
        ))}
      </div>

      <EditablePipeline
        initialStages={stages}
        onSave={setStages}
        title={`${selectedTemplate.charAt(0).toUpperCase() + selectedTemplate.slice(1)} Pipeline`}
        subtitle="Customize as needed"
      />
    </div>
  );
};

// ============================================
// EXPORT
// ============================================
export {
  BasicExample,
  ControlledExample,
  APIIntegrationExample,
  ContextExample,
  MultiplePipelinesExample,
  ValidatedExample,
  AdvancedExample,
};

// Para testar, importe um dos exemplos em uma página:
// import { BasicExample } from './examples/EditablePipeline.examples';
// e use <BasicExample /> em sua página
