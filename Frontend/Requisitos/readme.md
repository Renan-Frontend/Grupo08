**Product Requirements Document (PRD)**

**Time**: Grupo 08  
**Parceiro**: BP Company  
**Orientador**: Dr. Jackson Barbosa  
**Residentes**: André Oliveira, Bertrand Carvalho, Gustavo Araújo, Maurício Lima e Renan Naves.

[**1\. Visão Estratégica e Objetivos de Negócio	3**](#1.-visão-estratégica-e-objetivos-de-negócio)

[1.1. Contexto da Residência e Cenário Atual	3](#1.1.-contexto-da-residência-e-cenário-atual)

[1.2. O Problema de Negócio (A "Dor")	4](#1.2.-o-problema-de-negócio-\(a-"dor"\))

[1.3. Objetivos SMART (Metas da Entrega)	5](#1.3.-objetivos-smart-\(metas-da-entrega\))

[1.4. Proposta de Valor e Diferencial (The "Pitch")	7](#1.4.-proposta-de-valor-e-diferencial-\(the-"pitch"\))

[1.5. Alinhamento com a Estratégia da Empresa	8](#1.5.-alinhamento-com-a-estratégia-da-empresa)

[**2\. Personas e Processo Atual	9**](#2.-personas-e-processo-atual)

[2.1. Definição de Personas (Quem sente a dor?)	10](#2.1.-definição-de-personas-\(quem-sente-a-dor?\))

[2.2. Mapeamento do Processo Atual (O cenário "AS-IS")	11](#2.2.-mapeamento-do-processo-atual-\(o-cenário-"as-is"\))

[2.3. Pontos de Dor (Pain Points)	12](#2.3.-pontos-de-dor-\(pain-points\))

[2.4. A Jornada do Usuário Proposta (O cenário "TO-BE")	14](#2.4.-a-jornada-do-usuário-proposta-\(o-cenário-"to-be"\))

[**3\. Especificações Funcionais e User Stories	15**](#3.-especificações-funcionais-e-user-stories)

[3.1. User Stories (Histórias de Usuário)	16](#3.1.-user-stories-\(histórias-de-usuário\))

[3.2. Épicos de Produto	19](#3.2.-épicos-de-produto)

[3.3. Critérios de Aceite (Definition of Ready)	22](#3.3.-critérios-de-aceite-\(definition-of-ready\))

[**4\. Requisitos Não Funcionais e Compliance	25**](#4.-requisitos-não-funcionais-e-compliance)

[4.1. Segurança e Privacidade (Compliance)	25](#4.1.-segurança-e-privacidade-\(compliance\))

[R-S01 \- Controle de Acesso e Autenticação	25](#r-s01---controle-de-acesso-e-autenticação)

[R-S02 \- Proteção de Credenciais	26](#r-s02---proteção-de-credenciais)

[R-S03 \- Segurança dos Dados	26](#r-s03---segurança-dos-dados)

[R-S04 \- Privacidade dos Usuários	27](#r-s04---privacidade-dos-usuários)

[R-S05 \- Conformidade com a LGPD	27](#r-s05---conformidade-com-a-lgpd)

[R-S06 \- Segurança nas Integrações Externas	28](#r-s06---segurança-nas-integrações-externas)

[R-S07 \- Auditoria e Monitoramento de Segurança	28](#r-s07---auditoria-e-monitoramento-de-segurança)

[R-S08 \- Responsabilidade e Conscientização dos Usuários	28](#r-s08---responsabilidade-e-conscientização-dos-usuários)

[4.2. Performance e Escalabilidade	29](#4.2.-performance-e-escalabilidade)

[R-P01 – Tempo de Resposta	29](#r-p01-–-tempo-de-resposta)

[R-P02 \- Desempenho em Ambientes Web e Mobile	29](#r-p02---desempenho-em-ambientes-web-e-mobile)

[R-P03 \- Gerenciamento de Carga	30](#r-p03---gerenciamento-de-carga)

[R-P05 \- Otimização de Processamento	30](#r-p05---otimização-de-processamento)

[R-P06 – Performance da Sincronização Offline	31](#r-p06-–-performance-da-sincronização-offline)

[R-P07 \- Monitoramento de Desempenho	31](#r-p07---monitoramento-de-desempenho)

[R-P08 \- Planejamento para Crescimento Futuro	31](#r-p08---planejamento-para-crescimento-futuro)

[4.3. Confiabilidade e Disponibilidade	32](#4.3.-confiabilidade-e-disponibilidade)

[R-C01 \- Disponibilidade do Serviço	32](#r-c01---disponibilidade-do-serviço)

[R-C02 \- Tolerância a Falhas	32](#r-c02---tolerância-a-falhas)

[R-C03 \- Continuidade Operacional em Modo Offline	33](#r-c03---continuidade-operacional-em-modo-offline)

[R-C04 \- Backup e Recuperação de Dados	33](#r-c04---backup-e-recuperação-de-dados)

[R-C05 \- Gerenciamento de Erros e Exceções	34](#r-c05---gerenciamento-de-erros-e-exceções)

[R-C06 \- Integridade dos Dados	34](#r-c06---integridade-dos-dados)

[R-C07 \- Recuperação Pós-Falha	34](#r-c07---recuperação-pós-falha)

[R-C08 \- Monitoramento de Disponibilidade	35](#r-c08---monitoramento-de-disponibilidade)

[4.4. Manutenibilidade e Padrões de Código	35](#4.4.-manutenibilidade-e-padrões-de-código)

[R-M01 \- Arquitetura em Camadas	35](#r-m01---arquitetura-em-camadas)

[R-M02 \- Padronização do Código	35](#r-m02---padronização-do-código)

[R-M03 \- Documentação Técnica	36](#r-m03---documentação-técnica)

[R-M04 \- Versionamento e Controle de Código	36](#r-m04---versionamento-e-controle-de-código)

[R-M05 \- Reutilização e Modularização	37](#r-m05---reutilização-e-modularização)

[R-M06 \- Testabilidade	37](#r-m06---testabilidade)

[R-M07 \- Gestão de Dependências	37](#r-m07---gestão-de-dependências)

[R-M08 \- Facilitação da Evolução do Produto	38](#r-m08---facilitação-da-evolução-do-produto)

[R-M09 \- Boas Práticas de Engenharia de Software	38](#r-m09---boas-práticas-de-engenharia-de-software)

[4.5. Tecnologias e Infraestrutura (Constraints)	39](#4.5.-tecnologias-e-infraestrutura-\(constraints\))

[R-R01 – Ambiente de Execução	39](#r-r01-–-ambiente-de-execução)

[R-R02 \- Infraestrutura de Hospedagem	39](#r-r02---infraestrutura-de-hospedagem)

[R-R03 – Tecnologias de Desenvolvimento	40](#r-r03-–-tecnologias-de-desenvolvimento)

[R-R04 – Integrações com Serviços Externos	40](#r-r04-–-integrações-com-serviços-externos)

[R-R05 – Limitações Orçamentárias	40](#r-r05-–-limitações-orçamentárias)

[R-R06 – Restrições de Prazo	41](#r-r06-–-restrições-de-prazo)

[R-R07 – Capacidade da Equipe	41](#r-r07-–-capacidade-da-equipe)

[R-R08 – Restrições de Conectividade	41](#r-r08-–-restrições-de-conectividade)

[R-R09 – Evolução das Restrições	42](#r-r09-–-evolução-das-restrições)

[**5\. Métricas de Sucesso e KPIs	42**](#5.-métricas-de-sucesso-e-kpis)

[5.1. Indicadores Chave de Performance (KPIs) de Negócio	43](#5.1.-indicadores-chave-de-performance-\(kpis\)-de-negócio)

[5.2. Métricas de Produto (Engajamento e UX)	43](#5.2.-métricas-de-produto-\(engajamento-e-ux\))

[5.3. Métricas Técnicas (Sucesso da Engenharia)	44](#5.3.-métricas-técnicas-\(sucesso-da-engenharia\))

[5.4. Plano de Coleta de Dados	44](#5.4.-plano-de-coleta-de-dados)

[**6\. Riscos, Dependências e Mitigação	45**](#6.-riscos,-dependências-e-mitigação)

[6.1. Matriz de Riscos	45](#6.1.-matriz-de-riscos)

[6.2. Dependências Críticas	46](#6.2.-dependências-críticas)

[6.3. Plano de Contingência	46](#6.3.-plano-de-contingência)

# **1\. Visão Estratégica e Objetivos de Negócio**  {#1.-visão-estratégica-e-objetivos-de-negócio}

O BP8 foi concebido como um software de apoio à gestão de fluxos de processos de negócio, com ênfase na simplicidade, acessibilidade e integração tecnológica, visando atender às demandas contemporâneas de transformação digital, inovação e melhoria contínua dos processos organizacionais. No contexto da residência, o projeto configura-se como uma oportunidade para a aplicação prática dos conhecimentos adquiridos pelos residentes, ao articular formação profissional, desenvolvimento tecnológico e geração de valor para a empresa parceira.

Sob a perspectiva estratégica, o BP8 busca contribuir para o aumento da eficiência operacional, a redução de erros e retrabalho, a padronização dos processos internos, o fortalecimento da governança e da rastreabilidade, bem como o suporte estruturado à tomada de decisão e a promoção da transformação digital. Ademais, para além de seu caráter acadêmico, o projeto foi concebido com uma perspectiva de evolução futura, considerando seu potencial de aplicação em ambientes corporativos reais e sua viabilidade para eventual comercialização.

## **1.1. Contexto da Residência e Cenário Atual** {#1.1.-contexto-da-residência-e-cenário-atual}

O projeto BP8 é desenvolvido no âmbito da Residência em Tecnologia da Informação e Comunicação, cujo propósito central consiste na promoção da inovação, da transformação digital e da formação profissional por meio da execução de projetos aplicados em parceria com organizações do setor privado. Nesse contexto, os residentes são incentivados a atuar de forma integrada em todas as etapas do ciclo de desenvolvimento de software, abrangendo desde o levantamento e a análise de requisitos até a entrega final da solução, incluindo processos de validação com usuários, elaboração de relatórios técnicos e apresentação pública dos resultados.

A empresa parceira, caracterizada como uma organização privada, realizava anteriormente a gestão de seus processos por meio de planilhas eletrônicas e procedimentos informais, fundamentados principalmente no uso de arquivos Excel, na troca de e-mails e em comunicações não estruturadas. Esse modelo operacional apresentava limitações significativas, como elevada dependência de atividades manuais, maior propensão a erros de preenchimento e consolidação, ausência de centralização das informações, dificuldade de rastreabilidade histórica, baixa padronização dos fluxos de trabalho e restrições no acompanhamento sistemático de indicadores.

## **1.2. O Problema de Negócio (A "Dor")** {#1.2.-o-problema-de-negócio-(a-"dor")}

O principal problema de negócio enfrentado pela empresa parceira relaciona-se à elevada dependência de planilhas eletrônicas e de processos informais para a gestão de seus fluxos operacionais e indicadores de desempenho. A utilização predominante do Excel como ferramenta central de controle tem resultado, de forma recorrente, em retrabalho e perda de informações, decorrentes de fatores como a existência de múltiplas versões de arquivos, atualizações descentralizadas, falhas humanas no preenchimento e a ausência de mecanismos automáticos de validação.

Essas limitações impactam diretamente os setores de gestão, que dependem da confiabilidade e da integridade dos dados para o monitoramento dos processos e a tomada de decisão. A inexistência de um ambiente centralizado e estruturado dificulta a consolidação das informações e compromete a obtenção de uma visão sistêmica do desempenho organizacional.

Como consequência, o cenário vigente gera impactos relevantes nos âmbitos financeiro, operacional e estratégico. No âmbito financeiro, observa-se ineficiência operacional associada ao retrabalho e ao desperdício de recursos. No plano operacional, verificam-se atrasos, inconsistências e redução da produtividade. Já no nível estratégico, evidencia-se a limitação na análise de dados e na definição de ações fundamentadas em informações confiáveis.

Adicionalmente, a ausência de mecanismos de rastreabilidade e de um histórico estruturado dificulta a identificação das causas de falhas, a avaliação das mudanças implementadas e o acompanhamento sistemático da evolução dos processos ao longo do tempo.

## 

## **1.3. Objetivos SMART (Metas da Entrega)** {#1.3.-objetivos-smart-(metas-da-entrega)}

No que se refere à dimensão *Specific* (Específico), o projeto estabelece como objetivo o desenvolvimento e a entrega, até a data prevista, de um protótipo de alta fidelidade do software BP8. Esse protótipo deverá contemplar as telas iniciais e os principais fluxos operacionais implementados, um banco de dados estruturado, APIs funcionais e as funcionalidades centrais relacionadas à autenticação, modelagem, registro de informações e gestão de *Business Process Flow*, bem como uma integração básica com os módulos de indicadores de desempenho (KPIs) e de modelos de linguagem de grande porte (LLMs). Além disso, prevê-se a disponibilização de uma versão inicial (V1), com foco em demonstração e apresentação comercial, destinada à validação da proposta de valor. Espera-se, ainda, que o protótipo represente, de forma funcional, o ciclo completo de gestão de processos proposto pelo BP8.

No que concerne à dimensão *Measurable* (Mensurável), o sucesso da entrega será avaliado com base em critérios objetivos previamente definidos. Entre esses critérios, destaca-se a disponibilização de um protótipo funcional contendo, no mínimo, duas entidades básicas configuradas (clientes e vendas), com seus respectivos formulários vinculados e fluxos de processos operacionais associados. Adicionalmente, será considerada a implementação efetiva do banco de dados e das APIs de suporte às funcionalidades principais, bem como a execução de cenários completos de uso, abrangendo o cadastro e a edição de registros, a atribuição de atividades, a navegação pelos fluxos e a consulta aos dados consolidados. A validação também incluirá a realização de testes com, no mínimo, três usuários avaliadores, além do registro sistemático das interações durante o uso para fins de análise posterior.

Quanto à dimensão *Achievable* (Atingível), os objetivos definidos são considerados viáveis dentro do prazo estabelecido, tendo em vista a delimitação do escopo à versão inicial do produto (MVP/V1), a priorização das funcionalidades essenciais e a postergação de recursos avançados para etapas futuras. Soma-se a isso a utilização de um protótipo de alta fidelidade como estratégia de validação preliminar e a adoção de uma arquitetura em camadas, a qual favorece o desenvolvimento incremental e a escalabilidade da solução.

No que se refere à dimensão *Relevant* (Relevante), os objetivos definidos apresentam elevada pertinência, uma vez que respondem diretamente às necessidades identificadas da empresa parceira, contribuem para a redução de retrabalho e da perda de informações, fortalecem a governança dos processos organizacionais e subsidiam a tomada de decisão baseada em dados. Adicionalmente, tais objetivos possibilitam a demonstração do potencial comercial do BP8 e promovem a consolidação da formação prática dos residentes, ao integrar aprendizado teórico, desenvolvimento tecnológico e aplicação em contexto real.

Quanto à dimensão *Time-bound* (Temporal), o projeto apresenta um cronograma estruturado a partir de marcos claramente definidos. A entrega do protótipo funcional está prevista para o dia 12 do mês corrente, seguida pelo período de testes e validação entre os dias 12 e 19, culminando na apresentação e avaliação final no dia 19\. Todos os objetivos deverão ser integralmente alcançados até a data da apresentação, assegurando a disponibilidade de evidências técnicas, funcionais e demonstrativas para fins de avaliação.

No que concerne ao método de validação, o protótipo será avaliado por meio da observação direta do uso em contexto real, acompanhando-se a execução dos principais cenários operacionais pelos usuários avaliadores. Durante esse processo, serão sistematicamente registrados aspectos como as dificuldades encontradas, o tempo de execução das tarefas, a ocorrência de erros recorrentes e os feedbacks espontâneos dos participantes. Essas informações constituirão a base empírica para a realização de ajustes, refinamentos e para a evolução contínua do produto.

## 

## **1.4. Proposta de Valor e Diferencial (The "Pitch")** {#1.4.-proposta-de-valor-e-diferencial-(the-"pitch")}

O BP8 consiste em um software de gestão de *Business Process Flow* desenvolvido com ênfase na simplicidade, na acessibilidade e na integração tecnológica, destinado a apoiar organizações na modelagem, execução, monitoramento e evolução de seus processos de forma estruturada e eficiente. Em contraste com soluções tradicionais, que frequentemente apresentam elevada complexidade técnica e demandam conhecimento especializado em notações formais, o BP8 adota uma abordagem visual e intuitiva baseada em estados, possibilitando que usuários com distintos níveis de proficiência técnica compreendam e operem os fluxos de trabalho de maneira autônoma.

A principal proposta de valor do BP8 reside na centralização das informações operacionais em um ambiente unificado, na redução do retrabalho e da perda de dados, na facilitação da gestão de mudanças nos processos, no fortalecimento da transparência e da governança organizacional, bem como no suporte à tomada de decisões gerenciais por meio de indicadores integrados. Esses elementos contribuem para o aprimoramento da eficiência operacional e para a consolidação de práticas de gestão orientadas por dados.

Como diferencial competitivo, o BP8 incorpora recursos tecnológicos contemporâneos ao seu núcleo funcional, destacando-se pelo uso de um editor visual de processos baseado em estados, pelo suporte à operação offline com sincronização automática, pela importação e exportação estruturada de dados via Excel com mecanismos de validação, pela manutenção de um histórico detalhado de alterações, pela integração com ferramentas de indicadores de desempenho e pela utilização de modelos de linguagem de grande porte (LLMs) para a geração de diagramas BPMN a partir de descrições em linguagem natural.

Adicionalmente, o BP8 foi concebido como uma plataforma escalável e evolutiva, possibilitando a incorporação progressiva de funcionalidades avançadas sem comprometer a simplicidade da versão inicial. Sob a perspectiva estratégica, o software posiciona-se como uma solução intermediária entre ferramentas excessivamente técnicas e controles manuais informais, oferecendo um equilíbrio entre robustez funcional e facilidade de uso.

## 

## **1.5. Alinhamento com a Estratégia da Empresa** {#1.5.-alinhamento-com-a-estratégia-da-empresa}

O desenvolvimento do software BP8 encontra-se alinhado às diretrizes estratégicas da empresa parceira, especialmente no que se refere à busca por maior eficiência operacional, à modernização dos processos internos e ao fortalecimento da governança organizacional. Ao substituir práticas manuais e descentralizadas por uma plataforma integrada, o BP8 contribui diretamente para a transformação digital da organização, promovendo maior controle, padronização e transparência nos fluxos de trabalho.

Sob a perspectiva estratégica, o projeto apoia a empresa em múltiplas dimensões. A automatização da gestão de processos reduz o tempo dedicado a atividades manuais, minimiza o retrabalho e otimiza a utilização dos recursos disponíveis. Paralelamente, a centralização dos dados, associada a mecanismos de validação automática, eleva a confiabilidade das informações utilizadas nos processos decisórios. O controle de acesso por níveis, aliado à manutenção de um histórico detalhado de alterações, fortalece a rastreabilidade, a responsabilização e o monitoramento sistemático das atividades organizacionais.

Adicionalmente, a integração com indicadores de desempenho possibilita que gestores acompanhem resultados, identifiquem desvios e definam ações corretivas com maior agilidade. A flexibilidade na modelagem dos processos, por sua vez, facilita a adaptação da organização a mudanças internas, regulatórias ou de mercado, ampliando sua capacidade de resposta a contextos dinâmicos. A incorporação de recursos inovadores, como a integração com modelos de linguagem para geração automatizada de diagramas BPMN, também posiciona a empresa como adotante de soluções tecnológicas contemporâneas.

Além desses aspectos, o BP8 contribui para a consolidação de uma cultura organizacional orientada a processos e a dados, incentivando práticas sistemáticas de melhoria contínua e de aprendizado institucional. No contexto da residência, o projeto reforça ainda o compromisso da empresa parceira com a inovação aberta, a formação de talentos e o desenvolvimento colaborativo de soluções com efetivo potencial de aplicação no ambiente corporativo.

# **2\. Personas e Processo Atual** {#2.-personas-e-processo-atual}

As *personas* correspondem a perfis fictícios construídos com base em usuários reais que interagem com o software BP8. Sua definição fundamentou-se na análise do contexto organizacional da empresa parceira, nos diferentes níveis de acesso ao sistema e nas responsabilidades operacionais identificadas ao longo do projeto. Esse processo possibilitou a representação estruturada dos principais perfis de uso da solução.

O estabelecimento das *personas* tem como objetivo compreender, de forma sistemática, as necessidades, expectativas, dificuldades e padrões comportamentais dos usuários, de modo a orientar o desenvolvimento de funcionalidades alinhadas às demandas concretas da organização. Dessa forma, as *personas* constituem um instrumento metodológico relevante para o aprimoramento da usabilidade, da adequação funcional e da efetividade do sistema no contexto organizacional.

## 

## 

## **2.1. Definição de Personas (Quem sente a dor?)** {#2.1.-definição-de-personas-(quem-sente-a-dor?)}

| Persona | Perfil e Responsabilidades | Objetivos | Dores e Limitações | Necessidades |
| ----- | ----- | ----- | ----- | ----- |
| Gestor Estratégico (Carlos Menezes – Gerente de Operações – Nível 3\) | Supervisão dos processos organizacionais, acompanhamento de indicadores e definição de ações estratégicas | Acompanhar desempenho; avaliar mudanças; garantir padronização; reduzir custos | Baixa confiabilidade dos dados; pouca visibilidade dos processos; dependência de planilhas; ausência de histórico | Visão integrada; dashboards; relatórios; auditoria |
| Analista de Processos (Fernanda Rocha – Analista de Processos – Nível 3\) | Modelagem, manutenção e otimização dos fluxos de trabalho | Modelar processos; atualizar fluxos; documentar procedimentos; apoiar áreas operacionais | Ferramentas pouco intuitivas; dificuldade de versionamento; retrabalho; baixo suporte tecnológico | Editor visual; geração assistida de BPMN; versionamento; facilidade de edição |
| Operador de Processo (Lucas Almeida – Analista Operacional – Nível 2\) | Execução das atividades operacionais e atualização de registros | Executar tarefas; registrar dados corretamente; cumprir prazos | Falta de clareza; processos dispersos; erros de padronização; limitação offline | Lista de atividades; interface simples; suporte offline; validação automática |
| Usuário de Negócio (Mariana Costa – Analista de Negócio – Nível 1\) | Monitoramento de indicadores e resultados organizacionais | Monitorar desempenho; acompanhar processos; apoiar decisões | Acesso restrito; dependência de relatórios manuais; dados desatualizados | Visualização clara; acesso rápido a indicadores; relatórios simples |

## **2.2. Mapeamento do Processo Atual (O cenário "AS-IS")** {#2.2.-mapeamento-do-processo-atual-(o-cenário-"as-is")}

De modo geral, o processo vigente inicia-se com a definição de indicadores e metas em reuniões gerenciais, seguida pelo registro inicial das informações em planilhas eletrônicas e pela distribuição manual desses arquivos entre os responsáveis. Posteriormente, os dados são atualizados periodicamente por diferentes usuários, consolidados manualmente em arquivos centrais e submetidos a verificações informais de consistência. A partir dessas informações, são elaborados gráficos e relatórios básicos de forma manual, os quais subsidiam análises realizadas em reuniões periódicas. Com base nessas análises, são identificados desvios em relação às metas e propostas ações corretivas, normalmente registradas em documentos ou mensagens eletrônicas. O acompanhamento da execução dessas ações ocorre de maneira manual, com atualizações recorrentes das planilhas e arquivamento de versões anteriores sem padronização formal.

No cenário atual, as principais ferramentas empregadas incluem planilhas eletrônicas, documentos compartilhados em pastas locais ou em ambientes de nuvem, e-mails, aplicativos de mensagens e apresentações elaboradas manualmente para reuniões de acompanhamento. Não há, contudo, uma plataforma centralizada capaz de integrar dados, processos, histórico e indicadores de desempenho em um único ambiente.

O processo envolve diferentes perfis organizacionais, cujas responsabilidades são distribuídas de forma predominantemente informal. Os gestores são responsáveis pela definição de metas, análise de resultados e cobrança de ações, enquanto os analistas concentram-se na consolidação dos dados e na manutenção das planilhas. Os operadores alimentam as informações operacionais, e os usuários de apoio auxiliam na organização dos arquivos. Essa distribuição de papéis, entretanto, não é formalizada por meio de perfis de acesso ou regras automatizadas, o que fragiliza os mecanismos de controle e governança.

Nesse contexto, o cenário *AS-IS* caracteriza-se por elevada dependência de intervenção humana, baixo nível de automação, ausência de validação automática dos dados, multiplicidade de versões de arquivos, falta de rastreabilidade estruturada, baixa integração entre áreas e dificuldades de padronização dos fluxos de trabalho.

Entre as principais limitações observadas no processo atual, destaca-se, inicialmente, o risco de inconsistências, uma vez que a consolidação manual das informações aumenta a probabilidade de erros, divergências e perda de dados. Observa-se também baixa eficiência operacional, decorrente do tempo significativo dedicado à atualização, consolidação e correção de planilhas. Adicionalmente, a ausência de registros estruturados compromete a transparência, dificultando a identificação de responsáveis e das decisões tomadas ao longo do processo.

Outra limitação relevante refere-se ao escalonamento, visto que o modelo vigente torna-se inviável à medida que se amplia o volume de dados ou o número de usuários. Soma-se a isso a dependência de pessoas-chave, nas quais se concentra parte significativa do conhecimento operacional, gerando riscos à continuidade e à estabilidade organizacional.

## **2.3. Pontos de Dor (Pain Points)** {#2.3.-pontos-de-dor-(pain-points)}

A análise do cenário atual (*AS-IS*) evidencia a presença de múltiplos pontos críticos que impactam negativamente a eficiência, a confiabilidade e a capacidade de gestão dos processos organizacionais. Tais pontos de dor refletem limitações estruturais inerentes ao modelo baseado em planilhas eletrônicas e em procedimentos informais, afetando diretamente os diferentes perfis de usuários envolvidos nas atividades operacionais e gerenciais.

A inexistência de uma plataforma centralizada obriga os usuários a realizarem atualizações simultâneas em múltiplos arquivos, o que resulta em retrabalho recorrente, duplicidade de esforços e desperdício significativo de tempo, especialmente nos ciclos periódicos de acompanhamento. Além disso, o uso de diversas versões de planilhas armazenadas em locais distintos amplia o risco de perda de dados e de inconsistências informacionais, uma vez que alterações efetuadas por diferentes usuários nem sempre são devidamente sincronizadas, comprometendo a integridade dos registros.

A ausência de mecanismos de validação automática permite o registro de informações incompletas, incorretas ou fora de padrão, o que impacta diretamente a qualidade dos dados disponíveis para análise. Como consequência, gestores passam a fundamentar suas decisões em informações potencialmente imprecisas, reduzindo a efetividade dos processos decisórios. Paralelamente, a consolidação manual dos dados limita a agilidade na geração de relatórios e indicadores, uma vez que o tempo elevado necessário para reunir, verificar e organizar as informações compromete a capacidade de monitoramento contínuo do desempenho organizacional.

Outro aspecto relevante refere-se à fragilidade dos mecanismos de rastreabilidade. O processo vigente não possibilita identificar de forma clara quem realizou determinada alteração, quando a modificação ocorreu ou qual impacto foi gerado, o que enfraquece a governança e dificulta a realização de auditorias internas e processos de responsabilização.

Observa-se, ainda, a concentração do conhecimento operacional em determinados colaboradores, especialmente no que diz respeito a fórmulas, estruturas de planilhas e procedimentos específicos. Essa dependência eleva o risco organizacional em situações de ausência, desligamento ou sobrecarga desses profissionais, comprometendo a continuidade das atividades. Adicionalmente, a inexistência de fluxos formalizados favorece interpretações divergentes e práticas não uniformes entre as áreas, dificultando a replicação de boas práticas e prejudicando a consistência operacional.

No que se refere à gestão de mudanças, verifica-se que alterações em metas, indicadores ou procedimentos demandam reestruturações manuais dos arquivos existentes, configurando um processo lento, suscetível a erros e, frequentemente, gerador de resistência organizacional. Essa rigidez operacional reduz a capacidade de adaptação da empresa a novos contextos e demandas.

## **2.4. A Jornada do Usuário Proposta (O cenário "TO-BE")** {#2.4.-a-jornada-do-usuário-proposta-(o-cenário-"to-be")}

A jornada proposta no cenário *TO-BE* contempla a integração sistemática das atividades de planejamento, execução, monitoramento e melhoria contínua em um único ambiente digital, acessível por meio de plataformas web e dispositivos móveis. Nesse contexto, o fluxo operacional passa a ser orientado por processos formalizados, mecanismos de validação automática e controle de acesso estruturado por níveis de permissão, promovendo maior padronização, segurança e confiabilidade.

No cenário futuro, o processo será estruturado a partir de uma sequência integrada de etapas. Inicialmente, usuários com nível de acesso 3 serão responsáveis pela configuração das entidades, campos e formulários no BP8, bem como pela definição dos indicadores e metas associadas aos processos. Em seguida, esses usuários realizarão a criação dos *Business Process Flows* por meio do editor visual baseado em estados, o cadastro dos registros iniciais e a atribuição de atividades aos usuários de nível 2\.

Os usuários de nível 2 acessarão suas atividades por meio de listas organizadas e atualizarão os registros diretamente no sistema, tanto em modo online quanto offline. Durante esse processo, o BP8 realizará a validação automática dos dados inseridos. Em situações de operação offline, as informações serão armazenadas localmente e, após o restabelecimento da conexão, sincronizadas automaticamente com o banco de dados central. Todas as alterações efetuadas serão registradas no módulo de auditoria, assegurando rastreabilidade e transparência.

Paralelamente, o sistema consolidará as informações operacionais e consumirá a API de indicadores de desempenho para a exibição de métricas atualizadas. Usuários de nível 1 e gestores acompanharão os resultados por meio de dashboards simplificados, enquanto, quando necessário, poderão utilizar o módulo baseado em modelos de linguagem para a geração assistida de diagramas BPMN. A partir da análise dos resultados, ajustes nos fluxos de trabalho serão realizados, reiniciando-se o ciclo de forma contínua, em consonância com os princípios da melhoria contínua.

A jornada proposta fundamenta-se na atuação integrada das diferentes personas envolvidas. O Gestor Estratégico é responsável pelo acompanhamento dos indicadores, avaliação de impactos, autorização de ações sensíveis e definição de prioridades. O Analista de Processos atua na modelagem dos fluxos, no ajuste de formulários, na atualização das estruturas e no apoio às áreas operacionais. O Operador de Processo concentra-se na execução das atividades atribuídas, na atualização dos registros e na utilização do sistema em modo offline quando necessário. Por sua vez, o Usuário de Negócio dedica-se à consulta de dados, ao acompanhamento do desempenho e ao suporte às decisões gerenciais.

O cenário *TO-BE* é sustentado por um conjunto integrado de recursos tecnológicos, que inclui a plataforma central BP8 em versões web e mobile, um banco de dados centralizado, mecanismos de armazenamento local para operação offline, APIs externas para integração com módulos de KPIs e LLM, bem como módulos de validação e auditoria. 

# 

# **3\. Especificações Funcionais e User Stories** {#3.-especificações-funcionais-e-user-stories}

A adoção de histórias de usuário possibilita a descrição das funcionalidades sob a perspectiva dos diferentes perfis envolvidos, favorecendo a compreensão dos requisitos, a priorização das entregas e a validação das soluções implementadas. De forma complementar, a organização dos requisitos em épicos contribui para o planejamento incremental do produto, viabilizando a entrega progressiva de valor e a adaptação contínua às evidências obtidas durante o processo de validação.

## 

## **3.1. User Stories (Histórias de Usuário)** {#3.1.-user-stories-(histórias-de-usuário)}

| Épico | ID | História de Usuário |
| ----- | ----- | ----- |
| **E1 – Autenticação e Controle de Acesso** | US-01 | Como usuário, eu quero realizar login com e-mail e senha para acessar o software com segurança. |
|  | US-02 | Como usuário autenticado, eu quero realizar logout para encerrar minha sessão. |
|  | US-03 | Como usuário autenticado, eu quero alterar minha senha para proteger minha conta. |
|  | US-04 | Como usuário nível 3, eu quero criar usuários nível 1 e 2 para permitir o acesso de novos colaboradores. |
|  | US-05 | Como usuário nível 3, eu quero aprovar usuários antes da ativação para manter o controle de acesso. |
|  | US-06 | Como usuário, eu quero visualizar meus dados de perfil para conferir minhas informações. |
| **E2 – Modelagem de Dados** | US-07 | Como usuário nível 3, eu quero criar entidades para representar informações do negócio. |
|  | US-08 | Como usuário nível 3, eu quero definir campos para cada entidade para estruturar os dados. |
|  | US-09 | Como usuário nível 3, eu quero editar entidades e campos para adequá-los às mudanças do processo. |
|  | US-10 | Como usuário nível 3, eu quero excluir entidades e campos obsoletos para manter o sistema organizado. |
|  | US-11 | Como usuário nível 3, eu quero visualizar a estrutura das entidades para facilitar a manutenção. |
| **E3 – Gestão de Formulários** | US-12 | Como usuário nível 3, eu quero criar formulários vinculados a entidades para facilitar o cadastro. |
|  | US-13 | Como usuário nível 3, eu quero configurar campos nos formulários para padronizar os registros. |
|  | US-14 | Como usuário nível 3, eu quero editar formulários para refletir mudanças nos processos. |
|  | US-15 | Como usuário nível 3, eu quero excluir formulários não utilizados para evitar confusão. |
| **E4 – Business Process Flow** | US-16 | Como usuário nível 3, eu quero criar fluxos visuais baseados em estados para representar processos. |
|  | US-17 | Como usuário nível 3, eu quero editar fluxos para acompanhar mudanças organizacionais. |
|  | US-18 | Como usuário, eu quero visualizar o fluxo do processo para entender as etapas. |
|  | US-19 | Como usuário, eu quero navegar entre estados do processo para acompanhar sua evolução. |
| **E5 – Gestão de Registros** | US-20 | Como usuário autorizado, eu quero criar registros por meio de formulários para registrar informações. |
|  | US-21 | Como usuário nível 3, eu quero atribuir registros a usuários nível 2 para distribuir atividades. |
|  | US-22 | Como usuário nível 2, eu quero visualizar meus registros atribuídos para organizar meu trabalho. |
|  | US-23 | Como usuário nível 2, eu quero editar apenas registros atribuídos a mim para cumprir minhas tarefas. |
|  | US-24 | Como usuário nível 3, eu quero autorizar alterações sensíveis para garantir governança. |
| **E6 – Operação Offline** | US-25 | Como usuário, eu quero utilizar o software offline para continuar trabalhando sem internet. |
|  | US-26 | Como usuário, eu quero que meus dados sejam salvos localmente para evitar perdas. |
|  | US-27 | Como usuário, eu quero que o software sincronize automaticamente quando a conexão retornar. |
|  | US-28 | Como usuário, eu quero ser informado sobre o status da sincronização. |
| **E7 – Integração com Excel** | US-29 | Como usuário autorizado, eu quero exportar dados para Excel para edição em lote. |
|  | US-30 | Como usuário autorizado, eu quero importar planilhas para atualizar dados no software. |
|  | US-31 | Como usuário, eu quero receber relatórios de erros na importação para corrigir inconsistências. |
| **E8 – Auditoria e Rastreabilidade** | US-32 | Como gestor, eu quero consultar o histórico de alterações para garantir transparência. |
|  | US-33 | Como gestor, eu quero identificar responsáveis por modificações nos dados. |
|  | US-34 | Como usuário autorizado, eu quero visualizar logs de atividades para auditoria. |
| **E9 – Integrações Externas** | US-35 | Como usuário, eu quero gerar BPMN a partir de linguagem natural para agilizar a modelagem. |
|  | US-36 | Como gestor, eu quero visualizar KPIs integrados para avaliar desempenho. |
|  | US-37 | Como usuário, eu quero consultar indicadores atualizados para apoiar decisões. |

## 

## **3.2. Épicos de Produto** {#3.2.-épicos-de-produto}

| Épico | Tema | Descrição | Objetivo | Funcionalidades Principais |
| ----- | ----- | ----- | ----- | ----- |
| **E1** | Autenticação e Controle de Acesso | Funcionalidades relacionadas à identificação dos usuários, controle de sessão e gestão de permissões | Garantir acesso seguro ao sistema e restringir funcionalidades conforme os níveis definidos | Login por e-mail e senha; logout; alteração de senha; controle de níveis (1, 2 e 3); aprovação de usuários nível 1 e 2 |
| **E2** | Modelagem de Dados | Criação e manutenção da estrutura de dados do sistema | Permitir que usuários nível 3 modelem o domínio do negócio de forma flexível e organizada | Criação de entidades; definição de campos; validação de tipos; edição e exclusão de estruturas |
| **E3** | Gestão de Formulários | Construção de formulários vinculados às entidades para entrada e edição de dados | Facilitar o cadastro e a atualização dos registros de forma padronizada | Criação de formulários; vinculação a entidades; configuração de campos; edição e exclusão |
| **E4** | Business Process Flow | Modelagem e gerenciamento dos fluxos de processos por meio de editor visual baseado em estados | Permitir a representação visual dos processos organizacionais | Criação de fluxos; editor visual; definição de estados e transições; associação a entidades |
| **E5** | Gestão de Registros | Controle dos dados operacionais gerados pelos formulários | Organizar, distribuir e acompanhar as atividades relacionadas aos registros | Criação e edição de registros; exclusão controlada; atribuição a usuários nível 2; visualização por responsável |
| **E6** | Operação Offline | Suporte ao uso do sistema em ambientes com conectividade limitada | Garantir continuidade operacional independentemente da conexão | Armazenamento local; criação e edição offline; sincronização automática; tratamento de falhas |
| **E7** | Integração com Excel | Integração com planilhas eletrônicas para operações em lote | Permitir manipulação eficiente de dados externos com validação | Exportação por entidade; importação validada; rejeição de dados inválidos; relatórios de erro |
| **E8** | Auditoria e Rastreabilidade | Registro e consulta do histórico de alterações | Garantir transparência, governança e responsabilização | Registro de alterações; identificação de autor; data e tipo da modificação; consulta ao histórico |
| **E9** | Integrações Externas | Comunicação com serviços externos (LLM e KPIs) | Ampliar a capacidade analítica e de modelagem do software | Integração com API de KPIs; geração de BPMN via LLM; gerenciamento de chamadas externas; tratamento de falhas |

## 

## **3.3. Critérios de Aceite (Definition of Ready)** {#3.3.-critérios-de-aceite-(definition-of-ready)}

A adoção sistemática dos critérios de aceite contribui para a redução de ambiguidades, a mitigação de riscos técnicos e o aprimoramento do planejamento das atividades. Por sua vez, as definições de feito garantem que as funcionalidades entregues atendam aos padrões estabelecidos de qualidade, usabilidade, segurança e conformidade com o escopo definido.

| Dimensão | Definition of Ready (DoR) | Definition of Done (DoD) |
| :---: | :---: | :---: |
| Clareza e Escopo | História descrita no formato padrão; objetivo definido; escopo compatível com o MVP; dependências identificadas | Funcionalidade implementada conforme especificação; critérios atendidos; aderência aos padrões |
| Regras e Requisitos | Regras de negócio documentadas; permissões definidas; restrições descritas | Permissões validadas; segurança atendida; ausência de vulnerabilidades |
| Critérios e Validação | Critérios objetivos definidos; cenários principais e exceções descritos | Testes funcionais executados; cenários principais e alternativos validados |
| Dados e Integrações | Entidades, campos e integrações mapeados; formatos definidos | Integrações testadas; impacto em funcionalidades existentes avaliado |
| Viabilidade e Arquitetura | Viabilidade técnica analisada; impactos arquiteturais avaliados | Integração ao ambiente principal validada; estabilidade assegurada |
| Usabilidade e Documentação | — | Interface validada; mensagens claras; documentação atualizada; registros de auditoria gerados |

Uma história de usuário será considerada pronta para desenvolvimento quando apresentar clareza funcional, escopo bem delimitado, regras de negócio identificadas, critérios de aceite especificados, mapeamento adequado de dados e integrações, bem como viabilidade técnica previamente avaliada. Esses elementos asseguram que a equipe possua informações suficientes para iniciar a implementação de forma estruturada e alinhada aos objetivos do projeto.

Uma história será considerada concluída quando a funcionalidade estiver integralmente implementada, testada, integrada ao ambiente principal e validada quanto à usabilidade, documentação e requisitos de segurança. O atendimento ao DoD garante que as entregas estejam aptas para uso, demonstração e avaliação, tanto no contexto técnico quanto acadêmico.

As histórias de usuário são validadas com base em critérios estruturados no formato *Given / When / Then*, que favorece a definição objetiva dos comportamentos esperados e a validação sistemática das funcionalidades. Esse modelo contribui para a redução de interpretações ambíguas e para o alinhamento entre usuários, equipe técnica e avaliadores.

A validação das funcionalidades do BP8 segue um fluxo estruturado, que compreende a verificação prévia do atendimento ao DoR, a implementação conforme especificação, a execução de testes funcionais, a validação interna pela equipe, a realização de testes com usuários avaliadores, o registro sistemático de feedbacks e a aplicação de ajustes finais, quando necessários. Somente após a conclusão dessas etapas a funcionalidade é considerada apta para apresentação e avaliação

**3.4. Priorização (Método MoSCoW)**

| Categoria | Área | Funcionalidades |
| ----- | ----- | ----- |
| **Must Have** | Autenticação e Acesso | Login por e-mail e senha; logout; alteração de senha; controle de níveis (1, 2 e 3); aprovação de usuários |
|  | Estrutura de Dados | Criação de entidades; definição de campos; validação de dados |
|  | Formulários e Registros | Criação e edição de formulários; cadastro e edição de registros; atribuição de atividades |
|  | Business Process Flow | Editor visual baseado em estados; associação com entidades; navegação entre estados |
|  | Operação Offline | Armazenamento local; edição offline; sincronização automática |
|  | Importação e Exportação | Exportação para Excel; importação validada; rejeição de dados inválidos |
|  | Auditoria Básica | Registro de alterações; identificação do usuário; histórico consultável |
| **Should Have** | Dashboards Simplificados | Visão geral de indicadores; acompanhamento de estados; métricas operacionais básicas |
|  | Workflows de Aprovação | Autorização de exclusões; validação de alterações críticas; registro de autorizações |
|  | Integração com KPIs | Consumo da API externa; exibição de indicadores |
|  | Usabilidade | Mensagens orientativas; ajuda contextual; feedbacks visuais |
| **Could Have** | Geração de BPMN via LLM | Conversão de texto em BPMN; ajustes manuais posteriores |
|  | Templates de Processos | Modelos pré-configurados; reutilização de fluxos |
|  | Customização Visual | Temas; personalização de dashboards |
|  | Busca Avançada | Filtros dinâmicos; pesquisa ampliada |
| **Won’t Have** | Business Intelligence Avançado | Dashboards complexos; drill-down; drill-through; análise preditiva; integração multi-fonte |
|  | Workflows Complexos | Múltiplos níveis de aprovação; regras condicionais avançadas; cadeias hierárquicas extensas |
|  | Versionamento Completo | Histórico ramificado; resolução automática de conflitos |
|  | Permissões Customizadas | Perfis configuráveis; regras detalhadas |
|  | Internacionalização | Múltiplos idiomas; localização cultural |

# **4\. Requisitos Não Funcionais e Compliance** {#4.-requisitos-não-funcionais-e-compliance}

Este capítulo apresenta os requisitos não funcionais do software BP8, contemplando aspectos relacionados à qualidade, segurança, desempenho, confiabilidade, manutenibilidade e conformidade normativa. Enquanto os requisitos funcionais descrevem as funcionalidades que o sistema deve oferecer, os requisitos não funcionais estabelecem as condições sob as quais essas funcionalidades devem operar, definindo padrões mínimos de desempenho, estabilidade e proteção das informações.

A especificação desses requisitos tem como finalidade assegurar que o BP8 atenda não apenas às demandas operacionais da organização, mas também às exigências legais, técnicas e institucionais aplicáveis. Dessa forma, busca-se garantir a sustentabilidade da solução, fortalecer sua credibilidade e viabilizar sua adoção em ambientes corporativos, caracterizados por elevados níveis de complexidade, criticidade e responsabilidade informacional.

## **4.1. Segurança e Privacidade (Compliance)** {#4.1.-segurança-e-privacidade-(compliance)}

### **R-S01 \- Controle de Acesso e Autenticação** {#r-s01---controle-de-acesso-e-autenticação}

O sistema deverá implementar mecanismos de controle de acesso baseados em perfis, conforme os níveis definidos (1, 2 e 3), assegurando que cada usuário tenha acesso exclusivamente às funcionalidades compatíveis com sua função organizacional. O software deverá:

* realizar autenticação por e-mail e senha;  
* proteger contra acessos não autorizados;  
* encerrar automaticamente sessões inativas;  
* restringir o acesso a funcionalidades sensíveis conforme o nível do usuário.

O critério de verificação será verificar se usuários de diferentes níveis acessam apenas funcionalidades autorizadas e se sessões inativas são encerradas automaticamente.

### **R-S02 \- Proteção de Credenciais** {#r-s02---proteção-de-credenciais}

As credenciais dos usuários deverão ser armazenadas e processadas de forma segura, utilizando técnicas adequadas de criptografia e funções de hash, impedindo o armazenamento de senhas em formato legível. O software deverá:

* aplicar algoritmos de *hash* e criptografia reconhecidos;  
* exigir padrões mínimos de complexidade de senha;  
* permitir redefinição segura de credenciais;  
* restringir a reutilização excessiva de senhas.

O critério de análise será analisar os mecanismos de armazenamento e validação de credenciais e testar os processos de redefinição de senha.

### **R-S03 \- Segurança dos Dados** {#r-s03---segurança-dos-dados}

Os dados armazenados no sistema deverão ser protegidos contra perda, alteração indevida e acessos não autorizados, garantindo sua integridade e disponibilidade. O software deverá:

* validar dados de entrada;  
* manter mecanismos de controle de integridade;  
* aplicar segregação lógica das informações;  
* realizar backups periódicos do banco de dados.

O critério de verificação será verificar a existência de validações, registros de integridade e políticas de backup automatizadas.

### 

### 

### **R-S04 \- Privacidade dos Usuários** {#r-s04---privacidade-dos-usuários}

O sistema deverá assegurar o tratamento adequado dos dados pessoais dos usuários, limitando seu uso às finalidades operacionais e administrativas. O software deverá

* coletar apenas informações estritamente necessárias;  
* restringir o acesso a dados pessoais;  
* permitir atualização cadastral;  
* proteger informações sensíveis.

O critério de verificação será avaliar os mecanismos de controle de acesso aos dados pessoais e os formulários de coleta de informações.

### **R-S05 \- Conformidade com a LGPD** {#r-s05---conformidade-com-a-lgpd}

O *software* deverá estar em conformidade com os princípios estabelecidos pela Lei Geral de Proteção de Dados (Lei nº 13.709/2018). O software deverá:

* finalidade e necessidade no tratamento de dados;  
* transparência no uso das informações;  
* mecanismos de segurança e prevenção;  
* responsabilização e prestação de contas.

O critério de avaliação será avaliar políticas internas, fluxos de tratamento de dados e registros de consentimento, quando aplicável.

### 

### 

### 

### **R-S06 \- Segurança nas Integrações Externas** {#r-s06---segurança-nas-integrações-externas}

As integrações com serviços externos deverão adotar práticas seguras de comunicação e autenticação. O software deverá

* utilizar conexões criptografadas (HTTPS);  
* armazenar chaves de API de forma protegida;  
* limitar o escopo de permissões;  
* monitorar falhas e acessos indevidos.

Analisar configurações das APIs, protocolos utilizados e mecanismos de autenticação.

### 

### **R-S07 \- Auditoria e Monitoramento de Segurança** {#r-s07---auditoria-e-monitoramento-de-segurança}

O *software* deverá registrar eventos relevantes para fins de monitoramento, auditoria e resposta a incidentes, além de:

* tentativas de acesso;  
* falhas de autenticação;  
* alterações sensíveis;  
* ações administrativas.

O critério de verificação será verificar a existência de logs persistentes e mecanismos de consulta e análise.

### **R-S08 \- Responsabilidade e Conscientização dos Usuários** {#r-s08---responsabilidade-e-conscientização-dos-usuários}

O software deverá promover o uso responsável da plataforma, reduzindo riscos associados ao fator humano, além de:

* disponibilizar orientações sobre uso seguro;  
* informar sobre proteção de credenciais;  
* reforçar a importância da confidencialidade das informações.

O critério de verificação será avaliar a existência de materiais orientativos e mensagens informativas no sistema.

## **4.2. Performance e Escalabilidade** {#4.2.-performance-e-escalabilidade}

### 

### **R-P01 – Tempo de Resposta** {#r-p01-–-tempo-de-resposta}

O software deverá apresentar tempos de resposta compatíveis com uma experiência de uso satisfatória, especialmente nas funcionalidades críticas, incluindo:

* tempo médio de resposta para operações comuns (consulta, cadastro e edição) de até 2 segundos;  
* tempo máximo para operações complexas (importação e sincronização) de até 10 segundos;  
* fornecimento de feedback visual imediato para ações do usuário.  
   O critério de verificação será a realização de testes de desempenho para medição dos tempos médios e máximos de resposta.

### **R-P02 \- Desempenho em Ambientes Web e Mobile** {#r-p02---desempenho-em-ambientes-web-e-mobile}

O software deverá manter desempenho consistente nas versões web e mobile, considerando limitações de dispositivos e redes, além de:

* otimizar o carregamento de telas;  
* reduzir requisições desnecessárias;  
* utilizar recursos locais de forma eficiente;  
* adaptar-se a diferentes resoluções.

O critério de verificação será a execução de testes em múltiplos dispositivos, navegadores e resoluções.

### **R-P03 \- Gerenciamento de Carga** {#r-p03---gerenciamento-de-carga}

O software deverá suportar múltiplos usuários simultaneamente sem degradação significativa de desempenho, considerando:

* atendimento inicial a pequenos grupos de usuários;  
* possibilidade de expansão gradual;  
* tolerância a picos moderados de acesso.

O critério de verificação será a realização de testes de carga e estresse.

**R-P04 – Escalabilidade da Arquitetura**

A arquitetura do sistema deverá favorecer a escalabilidade horizontal e vertical, permitindo:

* separação entre interface, lógica de negócio e dados;  
* replicação de serviços;  
* substituição ou ampliação de componentes.

O critério de verificação será a análise da arquitetura e a validação da capacidade de expansão.

### **R-P05 \- Otimização de Processamento** {#r-p05---otimização-de-processamento}

O software deverá adotar práticas para minimizar o consumo de recursos computacionais, incluindo:

* uso eficiente de consultas ao banco de dados;  
* aplicação de indexação adequada;  
* utilização de mecanismos de cache;  
* processamento assíncrono quando aplicável.  
   O critério de verificação será a análise do desempenho das consultas e do consumo de recursos.

### **R-P06 – Performance da Sincronização Offline** {#r-p06-–-performance-da-sincronização-offline}

O mecanismo de sincronização deverá operar de forma eficiente, minimizando impactos ao usuário, além de:

* realizar envio incremental de dados;  
* priorizar registros pendentes;  
* retomar automaticamente após falhas;  
* prevenir duplicidades.

O critério de verificação será a execução de testes em cenários de desconexão e reconexão.

### **R-P07 \- Monitoramento de Desempenho** {#r-p07---monitoramento-de-desempenho}

O software deverá permitir o acompanhamento contínuo de indicadores técnicos relacionados à performance, incluindo:

* tempo médio de resposta;  
* taxa de erros;  
* uso de recursos;  
* falhas de integração.

O critério de verificação será a avaliação da existência de painéis, relatórios ou registros automatizados.

### **R-P08 \- Planejamento para Crescimento Futuro** {#r-p08---planejamento-para-crescimento-futuro}

O software deverá ser projetado considerando cenários de expansão organizacional e tecnológica, contemplando:

* aumento no número de usuários;  
* crescimento do volume de registros;  
* ampliação de integrações externas;  
* incorporação de módulos avançados.

O critério de verificação será a análise da documentação técnica e da arquitetura quanto à capacidade de expansão.

## **4.3. Confiabilidade e Disponibilidade** {#4.3.-confiabilidade-e-disponibilidade}

### **R-C01 \- Disponibilidade do Serviço** {#r-c01---disponibilidade-do-serviço}

O software deverá manter níveis adequados de disponibilidade, considerando o contexto inicial de MVP, incluindo:

* disponibilidade mínima de 95% durante o período de testes;  
* funcionamento contínuo nos horários comerciais;  
* monitoramento básico de indisponibilidades;  
* comunicação prévia aos usuários sobre interrupções programadas.  
   

O critério de verificação será a análise dos registros de operação e dos relatórios de indisponibilidade.

### **R-C02 \- Tolerância a Falhas** {#r-c02---tolerância-a-falhas}

O software deverá ser capaz de lidar com falhas parciais sem comprometer completamente sua operação, além de:

* tratar adequadamente exceções;  
* prevenir falhas em cascata;  
* isolar componentes críticos;  
* recuperar automaticamente processos interrompidos.  
   

O critério de verificação será a execução de testes de falha simulada e a análise do comportamento do sistema.

### **R-C03 \- Continuidade Operacional em Modo Offline** {#r-c03---continuidade-operacional-em-modo-offline}

O software deverá garantir a continuidade das operações em modo offline, permitindo:

* registro e edição de dados sem conexão;  
* armazenamento local seguro;  
* persistência das informações até a sincronização;  
* prevenção de perda de dados em quedas de energia ou encerramentos inesperados.  
   

O critério de verificação será a realização de testes em cenários de desconexão e interrupção abrupta.

### **R-C04 \- Backup e Recuperação de Dados** {#r-c04---backup-e-recuperação-de-dados}

O software deverá implementar rotinas periódicas de backup do banco de dados centralizado, contemplando:

* backups automáticos em intervalos regulares;  
* armazenamento em local seguro;  
* possibilidade de restauração parcial ou total;  
* validação periódica da integridade dos backups.

O critério de verificação será a execução de procedimentos de restauração e a verificação dos arquivos de backup.

### **R-C05 \- Gerenciamento de Erros e Exceções** {#r-c05---gerenciamento-de-erros-e-exceções}

O software deverá tratar erros de forma controlada, minimizando impactos na experiência do usuário, incluindo:

* exibição de mensagens claras e orientativas;  
* registro detalhado de falhas em logs;  
* prevenção de encerramentos inesperados;  
* diferenciação entre erros técnicos e operacionais.

O critério de verificação será a análise dos logs e a execução de testes de exceção.

### **R-C06 \- Integridade dos Dados** {#r-c06---integridade-dos-dados}

O software deverá preservar a integridade dos dados em todas as operações, especialmente durante sincronizações e importações, assegurando:

* validação antes da gravação;  
* controle de transações;  
* prevenção de duplicidades;  
* consistência entre banco central e armazenamento local.

O critério de verificação será a análise das transações e dos mecanismos de validação.

### **R-C07 \- Recuperação Pós-Falha** {#r-c07---recuperação-pós-falha}

O software deverá possibilitar a retomada das atividades após falhas com impacto mínimo, contemplando:

* reinicialização segura dos serviços;  
* recuperação automática de sessões;  
* retomada de sincronizações pendentes;  
* notificação ao usuário sobre falhas recuperadas.

O critério de verificação será a execução de testes de recuperação e análise do tempo de retomada.

### **R-C08 \- Monitoramento de Disponibilidade** {#r-c08---monitoramento-de-disponibilidade}

O software deverá dispor de mecanismos básicos de monitoramento da disponibilidade, incluindo:

* registro de períodos de indisponibilidade;  
* análise de falhas recorrentes;  
* acompanhamento da estabilidade operacional.

O critério de verificação será a avaliação dos relatórios e registros de monitoramento.

## **4.4. Manutenibilidade e Padrões de Código** {#4.4.-manutenibilidade-e-padrões-de-código}

### **R-M01 \- Arquitetura em Camadas** {#r-m01---arquitetura-em-camadas}

O software deverá adotar uma arquitetura em camadas, promovendo a separação clara entre os componentes do sistema, incluindo:

* camada de apresentação (interfaces web e mobile);  
* camada de lógica de negócio;  
* camada de acesso a dados;  
* camada de integração externa.

O critério de verificação será a análise da arquitetura do sistema e da organização dos componentes, confirmando a separação de responsabilidades.

### **R-M02 \- Padronização do Código** {#r-m02---padronização-do-código}

O código-fonte deverá seguir padrões de codificação previamente definidos, visando legibilidade, consistência e facilidade de manutenção, contemplando:

* nomenclatura clara de classes, métodos e variáveis;  
* organização modular dos arquivos;  
* uso consistente de estilos de escrita;  
* documentação mínima em trechos críticos.

O critério de verificação será a revisão do código-fonte quanto à aderência aos padrões estabelecidos.

### **R-M03 \- Documentação Técnica** {#r-m03---documentação-técnica}

O projeto deverá manter documentação técnica atualizada, incluindo:

* descrição da arquitetura;  
* modelos de dados;  
* contratos de APIs;  
* instruções básicas de implantação;  
* orientações para desenvolvimento.

O critério de verificação será a existência e atualização da documentação técnica associada ao projeto.

### **R-M04 \- Versionamento e Controle de Código** {#r-m04---versionamento-e-controle-de-código}

O código-fonte deverá ser mantido em um sistema de controle de versão, permitindo:

* histórico completo de alterações;  
* rastreabilidade das contribuições;  
* controle de branches;  
* realização de revisões de código.

O critério de verificação será a análise do repositório e do histórico de versionamento.

### **R-M05 \- Reutilização e Modularização** {#r-m05---reutilização-e-modularização}

O software deverá ser desenvolvido de forma modular, favorecendo:

* reutilização de componentes;  
* isolamento de funcionalidades;  
* redução de acoplamento;  
* facilidade de testes.

O critério de verificação será a análise da estrutura modular do código e do nível de acoplamento entre componentes.

### **R-M06 \- Testabilidade** {#r-m06---testabilidade}

O software deverá ser estruturado de modo a facilitar a realização de testes, contemplando:

* separação entre lógica de negócio e interface;  
* possibilidade de simulação de dependências;  
* organização clara dos casos de teste.

O critério de verificação será a avaliação da estrutura do código e da existência de mecanismos que permitam testes automatizados ou manuais.

### 

### 

### **R-M07 \- Gestão de Dependências** {#r-m07---gestão-de-dependências}

As bibliotecas e frameworks utilizados deverão ser controlados e documentados, evitando dependências obsoletas ou inseguras, assegurando:

* uso de versões estáveis;  
* atualização periódica;  
* verificação de vulnerabilidades conhecidas.

O critério de verificação será a análise das dependências declaradas e dos registros de atualização.

### **R-M08 \- Facilitação da Evolução do Produto** {#r-m08---facilitação-da-evolução-do-produto}

A arquitetura e o código deverão permitir a incorporação futura de novas funcionalidades, incluindo:

* módulos analíticos avançados;  
* integrações adicionais;  
* novos formatos de visualização;  
* expansão para novos mercados.

O critério de verificação será a avaliação da flexibilidade arquitetural e da capacidade de extensão do sistema.

### **R-M09 \- Boas Práticas de Engenharia de Software** {#r-m09---boas-práticas-de-engenharia-de-software}

O desenvolvimento do BP8 deverá seguir boas práticas de engenharia de software, contemplando:

* revisões periódicas de código;  
* refatoração contínua;  
* controle sistemático de qualidade;  
* padronização de commits.

O critério de verificação será a análise dos processos adotados pela equipe e dos registros no repositório de código.

## **4.5. Tecnologias e Infraestrutura (Constraints)** {#4.5.-tecnologias-e-infraestrutura-(constraints)}

### **R-R01 – Ambiente de Execução** {#r-r01-–-ambiente-de-execução}

O software deverá operar em múltiplos ambientes de execução, assegurando compatibilidade e acessibilidade, incluindo:

* navegadores web modernos, sem restrição específica de fornecedor;  
* dispositivos móveis com sistemas Android e iOS;  
* infraestrutura centralizada para armazenamento de dados.

O critério de verificação será a validação da execução do sistema nos ambientes definidos, sem perda de funcionalidades essenciais.

### **R-R02 \- Infraestrutura de Hospedagem** {#r-r02---infraestrutura-de-hospedagem}

A infraestrutura de hospedagem deverá atender às necessidades do MVP, priorizando simplicidade, confiabilidade e controle básico, contemplando:

* servidores em nuvem ou ambiente institucional;  
* banco de dados centralizado;  
* mecanismos básicos de backup;  
* controle de acesso administrativo.

O critério de verificação será a análise da infraestrutura adotada e de seus mecanismos de controle e segurança.

### **R-R03 – Tecnologias de Desenvolvimento** {#r-r03-–-tecnologias-de-desenvolvimento}

O software deverá permitir flexibilidade na escolha das tecnologias de desenvolvimento, desde que atendidos critérios técnicos mínimos, incluindo:

* maturidade da tecnologia;  
* suporte ativo da comunidade;  
* compatibilidade multiplataforma;  
* facilidade de manutenção;  
* integração com APIs externas.

O critério de verificação será a avaliação das tecnologias selecionadas em relação aos critérios estabelecidos.

### **R-R04 – Integrações com Serviços Externos** {#r-r04-–-integrações-com-serviços-externos}

O software deverá integrar-se a serviços externos necessários à sua operação, incluindo:

* APIs de modelos de linguagem (como OpenAI, Gemini ou equivalentes);  
* API do software de KPIs utilizado pela equipe.  
   Essas integrações deverão considerar restrições relacionadas à disponibilidade, limites de uso, políticas comerciais e alterações contratuais.

O critério de verificação será a validação das integrações e a análise de sua dependência operacional.

### **R-R05 – Limitações Orçamentárias** {#r-r05-–-limitações-orçamentárias}

O desenvolvimento do BP8 deverá considerar limitações orçamentárias inerentes ao contexto acadêmico, priorizando:

* uso de planos gratuitos ou de baixo custo;  
* adoção de ferramentas open source;  
* utilização de infraestrutura institucional.

O critério de verificação será a análise dos custos associados às tecnologias e serviços utilizados.

### **R-R06 – Restrições de Prazo** {#r-r06-–-restrições-de-prazo}

O software deverá ser desenvolvido considerando restrições temporais impostas pelo cronograma da residência, incluindo:

* entrega do MVP até o dia 12;  
* avaliação final no dia 19\.  
   Essas restrições exigem foco nas funcionalidades essenciais e priorização adequada das atividades.

O critério de verificação será a comparação entre o cronograma planejado e as entregas realizadas.

### **R-R07 – Capacidade da Equipe** {#r-r07-–-capacidade-da-equipe}

As decisões técnicas do projeto deverão considerar a capacidade da equipe envolvida, contemplando:

* nível de experiência dos residentes;  
* disponibilidade semanal;  
* curva de aprendizado das tecnologias adotadas.

O critério de verificação será a análise da aderência das soluções técnicas à capacidade da equipe.

### **R-R08 – Restrições de Conectividade** {#r-r08-–-restrições-de-conectividade}

O software deverá considerar ambientes com conectividade limitada, justificando a adoção de:

* suporte ao modo offline;  
* sincronização automática;  
* tolerância a falhas de rede.  
   

O critério de verificação será a execução de testes em cenários de conectividade instável ou inexistente.

### **R-R09 – Evolução das Restrições** {#r-r09-–-evolução-das-restrições}

As restrições identificadas deverão ser passíveis de revisão ao longo do ciclo de vida do projeto, considerando:

* amadurecimento do produto;  
* ampliação da base de usuários;  
* obtenção de novos recursos;  
* consolidação da proposta comercial.  
   

O critério de verificação será a análise da documentação e do planejamento evolutivo do sistema.

# **5\. Métricas de Sucesso e KPIs** {#5.-métricas-de-sucesso-e-kpis}

Considerando o contexto de um Produto Mínimo Viável (MVP) de natureza acadêmica, caracterizado por um número reduzido de usuários e por um período de validação limitado, os indicadores foram estabelecidos de maneira realista e compatível com o estágio atual de maturidade do produto. Dessa forma, busca-se assegurar a relevância dos resultados obtidos, ao mesmo tempo em que se respeitam as restrições operacionais e metodológicas inerentes ao ambiente de desenvolvimento.

## 

## **5.1. Indicadores Chave de Performance (KPIs) de Negócio** {#5.1.-indicadores-chave-de-performance-(kpis)-de-negócio}

| Indicador | Descrição | Meta para o MVP |
| ----- | ----- | ----- |
| Tempo médio de modelagem | Tempo para criar um BPF funcional | ≤ 30 minutos |
| Redução de retrabalho | Diminuição de correções manuais | ≥ 30% |
| Conformidade de processos | Etapas executadas conforme fluxo | ≥ 85% |
| Ciclo de atualização | Intervalo entre revisões | ≤ 30 dias |
| Aderência ao processo | Registros corretamente preenchidos | ≥ 90% |

## **5.2. Métricas de Produto (Engajamento e UX)** {#5.2.-métricas-de-produto-(engajamento-e-ux)}

| Métrica | Descrição | Meta para o MVP |
| ----- | ----- | ----- |
| Taxa de conclusão | Usuários que finalizam tarefas | ≥ 80% |
| Tempo até primeiro uso | Tempo até criar primeiro fluxo | ≤ 45 minutos |
| Erros por sessão | Falhas operacionais | ≤ 2 |
| Retenção | Usuários recorrentes | ≥ 70% |
| Satisfação (CSAT) | Avaliação média (1–5) | ≥ 4,0 |

## 

## **5.3. Métricas Técnicas (Sucesso da Engenharia)** {#5.3.-métricas-técnicas-(sucesso-da-engenharia)}

| Métrica | Descrição | Meta para o MVP |
| ----- | ----- | ----- |
| Disponibilidade | Tempo em operação | ≥ 95% |
| Latência média | Resposta do sistema | ≤ 2s |
| Sucesso da sincronização | Sincronizações corretas | ≥ 90% |
| Erros de integração | Falhas em APIs | ≤ 5% |
| Incidentes críticos | Falhas graves | ≤ 1 por ciclo |

## **5.4. Plano de Coleta de Dados** {#5.4.-plano-de-coleta-de-dados}

| Tipo de Coleta | Descrição | Dados Coletados / Instrumentos | Forma de Registro |
| ----- | ----- | ----- | ----- |
| Coleta Automática | Registro automático de eventos e métricas técnicas geradas pelo uso do sistema | Tempo de execução das operações; acessos e sessões; criação e edição de registros; eventos de sincronização; falhas técnicas; chamadas a APIs externas | Armazenamento em tabelas de log e auditoria |
| Coleta Manual | Coleta complementar baseada na percepção dos usuários e observação do uso | Questionários pós-uso; observação direta; registros de feedback | Instrumentos avaliativos com escala de 1 (péssimo) a 5 (excelente) |

| Métrica | Situação Atual (Baseline) | Meta (Target) | Fonte do Dado |
| ----- | ----- | ----- | ----- |
| Tempo de triagem de notas | 15 minutos / nota | 2 minutos / nota | Log do Sistema |
| Erros de digitação manual | 8% das entradas | \< 0.5% (Automação) | Banco de Dados |
| Satisfação do Usuário | N/A (Processo manual) | Nota \> 8/10 | Pesquisa Qualitativa  |

# **6\. Riscos, Dependências e Mitigação** {#6.-riscos,-dependências-e-mitigação}

O gerenciamento sistemático de riscos constitui um elemento importante para a redução de incertezas, o aumento da previsibilidade das atividades e o aprimoramento da qualidade das entregas. 

## 6.1. Matriz de Riscos {#6.1.-matriz-de-riscos}

| ID | Risco | Probabilidade | Impacto | Nível | Estratégia |
| :---: | :---: | :---: | :---: | :---: | :---: |
| R1 | Atraso no desenvolvimento | Média | Alto | Alto | Planejamento e priorização |
| R2 | Falhas na integração com APIs | Média | Alto | Alto | Testes e alternativas |
| R3 | Instabilidade da infraestrutura | Baixa | Alto | Médio | Backup e redundância |
| R4 | Dificuldade técnica com offline | Média | Médio | Médio | Protótipos antecipados |
| R5 | Baixa adesão dos usuários | Baixa | Médio | Baixo | Treinamento |
| R6 | Mudança de escopo | Média | Médio | Médio | Controle de requisitos |
| R7 | Limitação de tempo da equipe | Alta | Alto | Alto | Foco no MVP |
| R8 | Dependência de serviços externos | Média | Médio | Médio | Monitoramento |
| R9 | Problemas de segurança | Baixa | Alto | Médio | Revisões periódicas |

## 

## **6.2. Dependências Críticas** {#6.2.-dependências-críticas}

| Categoria | Dependências Identificadas |
| ----- | ----- |
| **Dependências Tecnológicas** | Disponibilidade das APIs de LLM (OpenAI, Gemini ou equivalentes); funcionamento contínuo da API de KPIs da equipe; estabilidade da infraestrutura de hospedagem; disponibilidade de bibliotecas e frameworks |
| **Dependências Organizacionais** | Apoio da empresa parceira; disponibilidade dos usuários para realização de testes; participação do orientador; cumprimento do cronograma institucional |
| **Dependências da Equipe** | Dedicação dos residentes; continuidade da participação dos membros; compartilhamento de conhecimento; comunicação interna |

## **6.3. Plano de Contingência** {#6.3.-plano-de-contingência}

| Risco Identificado | Estratégias de Mitigação |
| ----- | ----- |
| **Atrasos no Cronograma** | Repriorização imediata das funcionalidades; redução temporária do escopo; foco nos requisitos classificados como *Must Have* |
| **Falhas nas Integrações Externas** | Utilização de dados simulados (*mock*); implementação de modos alternativos de operação; isolamento dos módulos dependentes |
| **Indisponibilidade da Infraestrutura** | Migração temporária para ambiente alternativo; utilização de backups; comunicação prévia e contínua aos usuários |
| **Problemas no Modo Offline** | Simplificação temporária do mecanismo de sincronização; priorização da estabilidade dos dados; desativação parcial da funcionalidade, quando necessário |
| **Baixa Adoção pelos Usuários** | Realização de sessões de orientação; ajustes na interface do sistema; coleta intensiva e sistemática de feedback |
| **Rotatividade ou Indisponibilidade da Equipe** | Reforço da documentação técnica; redistribuição de tarefas; revisão das prioridades do projeto |

