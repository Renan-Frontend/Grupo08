import React from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './IaIntro.module.css';
import { AI_PARSE_POST } from '../../Api';
import { resolveToken, getErrorText } from './iaHelpers';

const EXAMPLE_NAME = 'Aprovação de Pedido de Compra';
const EXAMPLE_DESC =
  'O processo de Aprovação de Pedido de Compra inicia quando o Cliente executa a atividade Solicitar compra, que gera um Pedido. ' +
  'Em seguida é realizada a atividade Analisar Pedido. ' +
  'O fluxo então avalia a condicional Pedido aprovado?: se NAO, é executada a atividade Registrar Aprovacao, que cria o registro de Aprovacao; ' +
  'se SIM, é executada a atividade Validar orcamento. ' +
  'O fluxo avalia a condicional Orcamento aprovado?: se NAO, é executada a atividade Atualizar Pedido; ' +
  'se SIM, é executada a atividade Gerar OrdemDeCompra, que cria o documento OrdemDeCompra. ' +
  'Em seguida é executada a atividade Enviar OrdemDeCompra ao Fornecedor, e o Fornecedor então executa a atividade Fornecedor recebe OrdemDeCompra.';

const IaIntro = () => {
  const navigate = useNavigate();
  const [introProcessName, setIntroProcessName] = React.useState('');
  const [introDescription, setIntroDescription] = React.useState('');
  const [isParsing, setIsParsing] = React.useState(false);
  const [introFeedback, setIntroFeedback] = React.useState('');

  const canParse =
    introProcessName.trim().length >= 3 || introDescription.trim().length >= 10;

  const handleParseDescription = async (event) => {
    event.preventDefault();
    const trimmedName = introProcessName.trim();
    const trimmedDesc = introDescription.trim();
    if (!trimmedName && !trimmedDesc) return;

    const token = resolveToken();
    if (!token) {
      setIntroFeedback('Faça login novamente para usar o operador de IA.');
      return;
    }

    setIsParsing(true);
    setIntroFeedback('');

    try {
      const { url, options } = AI_PARSE_POST(
        { processName: trimmedName, description: trimmedDesc },
        token,
      );
      const response = await fetch(url, options);
      if (!response.ok) {
        const errorText = await getErrorText(
          response,
          'Falha ao analisar a descrição.',
        );
        setIntroFeedback(errorText);
        setIsParsing(false);
        return;
      }

      navigate('/ia/configurar', {
        state: {
          parseData: await response.json(),
          introName: trimmedName,
          processDescription: trimmedDesc,
        },
      });
    } catch {
      setIntroFeedback('Erro ao conectar. Tente novamente.');
    } finally {
      setIsParsing(false);
    }
  };

  return (
    <section className={styles.wrapper}>
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
          onClick={() => navigate('/ia/configurar')}
        >
          Criar manualmente
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
            style={{ resize: 'vertical', minHeight: 360 }}
            value={introDescription}
            onChange={(e) => setIntroDescription(e.target.value)}
            placeholder={
              'Descreva o fluxo completo do processo. Ex.:\n\n' +
              'O cliente solicita uma compra. O gestor analisa o pedido. ' +
              'Se aprovado, o financeiro valida o orçamento. ' +
              'Se o orçamento for suficiente, gera a ordem de compra e envia ao fornecedor. ' +
              'Caso contrário, o pedido é devolvido para ajuste.'
            }
          />
        </label>
        <button
          type="button"
          className={styles.secondaryButton}
          style={{
            alignSelf: 'flex-start',
            fontSize: '0.8rem',
            padding: '4px 12px',
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
          {isParsing ? 'Analisando...' : 'Criar processo'}
        </button>
      </form>
    </section>
  );
};

export default IaIntro;
