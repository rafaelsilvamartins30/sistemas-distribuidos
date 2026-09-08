1. Visão geral

Cada grupo constitui uma startup fictícia e desenvolve, ao longo do 
semestre, um sistema distribuído completo que resolva um problema real com 
impacto social identificável.

O trabalho é entregue em quatro etapas, cada uma apresentada em sala. As 
etapas são cumulativas: o que foi entregue na etapa anterior continua 
sendo avaliado nas seguintes, inclusive quanto a correções apontadas na 
devolutiva.

Ao final, o sistema deve demonstrar, em código funcional, os conteúdos 
trabalhados na disciplina — não bastando descrevê-los em documentação ou 
slides.
1.1 Requisitos mínimos do sistema
Item 	Mínimo exigido
Microsserviços de domínio 	4 serviços independentes
Bancos de dados 	1 por microsserviço, com instâncias separadas
Clientes distintos 	2 (ex.: web e mobile, ou web e painel 
administrativo)
Linguagens 	livre; poliglota é permitido e incentivado

O domínio é de escolha livre, sujeito a aprovação na Parte 1. Domínios 
triviais (CRUD de cadastro, lista de tarefas, blog) serão recusados por 
não sustentarem os padrões exigidos — especialmente SAGA, que requer uma 
transação de negócio atravessando ao menos três serviços.
2. Requisitos transversais (avaliados em todas as etapas)
2.1 Uso do Git e do GitHub

O fluxo de trabalho colaborativo é objeto de avaliação, não apenas meio de 
entrega.

    Repositório público, único por grupo, criado até a Parte 1.
    Os 4 integrantes devem constar como contribuidores com commits 
próprios.
    Cada integrante deve ter user.name e user.email configurados 
corretamente. Commits atribuídos a autor errado não contam para o 
integrante que efetivamente trabalhou.
    Trabalho em pares deve ser registrado com Co-authored-by: na mensagem 
do commit.
    Desenvolvimento em branches por funcionalidade, integradas por pull 
request.
    Cada PR deve ter ao menos um code review aprovado por outro integrante 
do grupo. PRs auto-aprovados ou mesclados sem revisão não contam.
    Histórico de commits distribuído ao longo do semestre. Concentração de 
todo o código em poucos commits às vésperas da entrega é indício de 
ausência de trabalho colaborativo e será considerada na nota individual.

2.2 Documentação no repositório

    README.md na raiz: nome da startup, problema, integrantes, instruções 
de execução.
    /docs: diagramas de arquitetura, decisões técnicas, contratos de API.
    As instruções de execução devem permitir que um terceiro suba o 
sistema do zero. Isso será verificado.

2.3 Congelamento do repositório

Nas etapas apresentadas em dois dias (Partes 2 e 4), o repositório é 
congelado às 23h59 da véspera do primeiro dia de apresentação, para todos 
os grupos. Commits posteriores não são considerados na avaliação daquela 
etapa.
3. Parte 1 — Concepção e Pitch (10%)

Apresentação: 17/09/2026 (aula 12) Formato: pitch de 5 minutos por grupo + 
arguição
Entregáveis

    Nome da startup e identidade mínima (logo opcional).
    Problema e motivação, fundamentados em ao menos 4 referências — 
artigos científicos, relatórios institucionais, dados oficiais. Fontes 
jornalísticas contam como complemento, não como base.
    Impacto social esperado: quem é beneficiado, de que forma, e como isso 
poderia ser medido.
    Esboço da solução: o que o sistema fará, sem detalhamento técnico 
ainda.
    Repositório GitHub criado, público, com README inicial e os 4 
integrantes como contribuidores.

Avaliação
Critério 	Peso
Clareza e relevância do problema 	25%
Qualidade e uso efetivo das referências 	25%
Consistência do impacto social alegado 	20%
Qualidade do pitch e domínio na arguição 	20%
Repositório configurado corretamente 	10%

Os 5 minutos são do grupo, não por pessoa: os quatro integrantes se 
revezam dentro do tempo. Todos devem falar.
4. Parte 2 — Arquitetura (20%)

Apresentação: 22/10 (grupos 1 a 5) e 27/10 (grupos 6 a 10) — aulas 20 e 21 
Ordem sorteada em 20/10

Esta etapa avalia projeto arquitetural documentado, com contratos 
definidos e decisões justificadas. Não é exigido sistema em execução — 
isso é a Parte 4. Protótipos parciais são bem-vindos, mas não substituem a 
documentação.
4.1 Decomposição em microsserviços

    Identificação dos 4 ou mais serviços de domínio, com responsabilidade 
de cada um.
    Justificativa das fronteiras adotadas: por que este corte e não outro.
    Diagrama de componentes e de comunicação entre serviços.

4.2 API REST

    Contrato completo dos endpoints de cada serviço (OpenAPI/Swagger 
recomendado).
    Uso correto de recursos, verbos HTTP e códigos de status.
    Estratégia de versionamento definida e justificada.
    Ao menos um recurso projetado com HATEOAS, demonstrando os links de 
navegação.

4.3 API Gateway e gateway routing

    Definição do gateway, com as regras de roteamento para os serviços 
internos.
    Responsabilidades atribuídas ao gateway (autenticação, rate limiting, 
agregação, etc.).

4.4 Backend for Frontend

    Ao menos 2 BFFs, um por tipo de cliente, com justificativa de por que 
as necessidades diferem.
    Demonstração explícita da diferença entre as respostas servidas a cada 
cliente.

4.5 Database per service

    Um banco por serviço, com tecnologia justificada (poliglota é 
permitido).
    Identificação dos pontos de consistência eventual do sistema.
    Análise do risco de dual write onde ele existir.
    Projeto do padrão outbox para ao menos um fluxo de publicação de 
eventos.

4.6 SAGA

    Escolha entre saga orquestrada ou coreografada — apenas uma variante, 
com justificativa da escolha frente à alternativa.
    Modelagem de uma transação de negócio atravessando ao menos 3 
serviços.
    Definição de todas as transações compensatórias.
    Diagrama de sequência do caminho feliz e de ao menos um cenário de 
falha com compensação.

4.7 CQRS

    Aplicação em ao menos um serviço, com separação entre modelo de 
escrita e de leitura.
    Justificativa: por que este serviço se beneficia da separação.
    Definição de como o modelo de leitura é atualizado e qual a defasagem 
aceitável.

Avaliação
Critério 	Peso
Decomposição e fronteiras dos serviços 	15%
Contrato REST (verbos, status, versionamento, HATEOAS) 	15%
Gateway e routing 	10%
BFF (2 clientes distintos) 	10%
Database per service, consistência eventual e outbox 	15%
SAGA (modelagem, compensações, cenário de falha) 	20%
CQRS 	10%
Qualidade da apresentação e domínio na arguição 	5%
5. Parte 3 — Containerização e Orquestração (20%)

Apresentação: 17/11/2026 (aula 25) Formato: vídeo entregue no repositório 
+ arguição presencial de 6 minutos por grupo

O vídeo (máximo 10 minutos) deve mostrar o sistema sendo levantado e os 
recursos em execução. Os 4 integrantes devem aparecer no vídeo explicando 
partes distintas. Ausência no vídeo acarreta a penalidade por não 
participação, ainda que o aluno esteja presente na aula.
5.1 Docker

    Dockerfile próprio para cada serviço — imagens prontas de terceiros 
sem customização não contam.
    Uso de multi-stage build onde aplicável, com justificativa do ganho.
    Volumes configurados para persistência dos bancos.
    Redes definidas com isolamento entre camadas.
    docker-compose.yml que suba o sistema completo com um único comando.

5.2 Kubernetes

    Deployments para cada serviço, com número de réplicas definido.
    Services para comunicação interna.
    Ingress roteando o tráfego externo — evidenciando a relação com o 
gateway routing projetado na Parte 2.
    ConfigMaps e Secrets, com toda configuração externalizada. Credenciais 
em código-fonte zeram este item.
    Demonstração de escalabilidade: aumento de réplicas de um serviço e 
evidência de distribuição de carga.
    Ambiente local aceito (Minikube, kind, k3s ou Docker Desktop).

Avaliação
Critério 	Peso
Dockerfiles e qualidade das imagens 	20%
Compose funcional com volumes e redes 	15%
Deployments e Services 	20%
Ingress e roteamento 	15%
ConfigMaps e Secrets 	15%
Demonstração de escalabilidade 	10%
Arguição presencial 	5%
6. Parte 4 — Sistema em Funcionamento (20%)

Apresentação: 10/12 (grupos 1 a 5) e 15/12 (grupos 6 a 10) — aulas 32 e 33 
Ordem sorteada em 08/12

O sistema deve rodar ao vivo, ao menos em ambiente de teste local. 
Apresentação de slides sem execução não é aceita.
6.1 Sistema distribuído funcional

Demonstração ao vivo de:

    Fluxo completo de ponta a ponta, passando por gateway, BFF e serviços 
de domínio.
    A SAGA executando — caminho feliz e, obrigatoriamente, um cenário de 
falha com compensação efetiva, provocado durante a apresentação.
    Consulta ao modelo de leitura do CQRS refletindo uma escrita.
    Bancos separados por serviço, evidenciados.

6.2 Integração de LLM

O sistema deve incorporar um modelo de linguagem em ao menos uma 
funcionalidade com propósito real dentro do domínio — não um chatbot 
decorativo acoplado à interface.

RAG (obrigatório)

    Base de conhecimento própria, relevante ao domínio da startup.
    Pipeline completo: ingestão, geração de embeddings, armazenamento em 
base vetorial, recuperação e geração.
    Avaliação da qualidade do RAG: ao menos 5 perguntas de teste com 
análise das respostas, comparando com e sem recuperação.

LangChain (obrigatório)

    Uso de chains na composição do fluxo.
    Ao menos uma tool integrada, permitindo ao modelo consultar dados 
reais do próprio sistema.
    Uso de agente é opcional; se empregado, justificar por que o fluxo 
exige decisão dinâmica.

LLM como serviço distribuído (obrigatório)

O LLM deve ser tratado como dependência remota falível, com ao menos dois 
dos mecanismos abaixo implementados:

    Circuit breaker na chamada ao provedor;
    Timeout e política de retry com backoff;
    Cache (semântico ou por chave) das respostas;
    Estratégia de fallback para indisponibilidade do modelo.

Deve ser apresentada uma análise de latência e custo: tempo de resposta 
medido e estimativa de custo por operação em escala.
Avaliação
Critério 	Peso
Sistema funcional de ponta a ponta 	20%
SAGA em execução, com compensação demonstrada 	20%
CQRS em execução 	10%
RAG (pipeline completo e avaliação) 	20%
LangChain (chains e tool) 	10%
LLM como serviço distribuído (resiliência, latência, custo) 	15%
Arguição 	5%
7. Nota individual

A nota de cada etapa é atribuída individualmente, não ao grupo. Parte-se 
da nota do grupo na etapa e aplicam-se os ajustes abaixo.
7.1 Contribuição individual

Dois indicadores, verificados a cada etapa:

Apresentação. Todos os 4 integrantes devem participar da apresentação de 
cada etapa, com fala própria sobre parte substantiva do trabalho. A 
arguição é dirigida nominalmente: o docente escolhe o integrante que 
responderá cada pergunta. Demonstrar desconhecimento do que o próprio 
grupo produziu reduz a nota individual, ainda que o integrante tenha 
falado.

Registro no GitHub. Verificam-se commits de autoria própria, participação 
em pull requests e revisões realizadas, considerando volume, distribuição 
temporal e relevância técnica das contribuições — não apenas a quantidade 
de commits.

Integrantes com contribuição substancialmente inferior à dos demais 
recebem nota proporcionalmente reduzida na etapa, independentemente do 
desempenho do grupo.
7.2 Penalidades

Individuais e cumulativas entre si:
Situação 	Penalidade
Falta não justificada na apresentação da etapa 	−50% da nota da etapa
Integrante presente que não participa da apresentação 	−50% da nota da 
etapa
Nome ausente da lista de contribuidores do repositório 	−50% da nota

A penalidade por não participar aplica-se ao integrante presente que não 
toma a palavra. Ao ausente injustificado aplica-se a penalidade por falta.

A penalidade por ausência entre os contribuidores é independente das 
demais e incide mesmo sobre quem apresentou bem: apresentar sem ter 
contribuído com código não preserva a nota.

Justificativas de ausência seguem o regulamento institucional e devem ser 
protocoladas nos prazos previstos.
8. Calendário de entregas
Etapa 	Data 	Peso
Definição dos grupos 	03/09/2026 	—
Parte 1 — Concepção e pitch 	17/09/2026 	10%
Sorteio da ordem — Parte 2 	20/10/2026 	—
Parte 2 — Arquitetura (grupos 1 a 5) 	22/10/2026 	20%
Parte 2 — Arquitetura (grupos 6 a 10) 	27/10/2026 	20%
Parte 3 — Containers e Kubernetes 	17/11/2026 	20%
Sorteio da ordem — Parte 4 	08/12/2026 	—
Parte 4 — Sistema funcionando (grupos 1 a 5) 	10/12/2026 	20%
Parte 4 — Sistema funcionando (grupos 6 a 10) 	15/12/2026 	20%
