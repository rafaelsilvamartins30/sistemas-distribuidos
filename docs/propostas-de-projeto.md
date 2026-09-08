# Propostas de Projetos de Sistemas Distribuídos

Este documento reúne **três propostas de projetos com impacto social real**, estruturadas para atender integralmente aos requisitos da disciplina de Sistemas Distribuídos descritos em [work.md](../work.md).

---

## Tabela Resumo dos Requisitos do Projeto

Para qualquer tema escolhido, a arquitetura final deve cobrir:

| Requisito | Mínimo Exigido | Observações |
| :--- | :--- | :--- |
| **Microsserviços de Domínio** | $\ge 4$ independentes | Fronteiras claras de bounded context |
| **Bancos de Dados** | 1 por serviço (instâncias isoladas) | *Database-per-service* (poliglota incentivado) |
| **Clientes / Frontends** | 2 clientes distintos | Ex.: Web Cidadão + Painel Gestor |
| **BFF (Backend For Frontend)** | 2 BFFs | Respostas e payloads customizados por tipo de cliente |
| **API Gateway** | 1 Gateway central | Roteamento, rate limiting, autenticação |
| **Padrão SAGA** | Atravessando $\ge 3$ serviços | Com transações compensatórias para cenários de falha |
| **CQRS** | Em $\ge 1$ serviço | Separação explícita entre modelo de leitura e escrita |
| **Transactional Outbox** | Em $\ge 1$ fluxo de eventos | Evita o problema de *dual write* |
| **Docker & Compose** | Dockerfiles próprios + Compose | Multi-stage build e subida em comando único |
| **Kubernetes** | Deployments, Services, Ingress, Secrets | Externalização de configs e teste de escalabilidade |
| **IA / LLM (RAG + LangChain)** | RAG + Tool + Resiliência | Pipeline vetorial, tool calling no sistema e circuit breaker/retry |

---

## Proposta 1: SOS-Clima / ResgateDistribuído
> **Plataforma Integrada de Gestão e Resposta a Desastres Climáticos e Enchentes**

### 1.1 Contexto e Problema Social
O Brasil enfrenta um aumento severo de eventos climáticos extremos (como as enchentes históricas no Rio Grande do Sul e deslizamentos em áreas de encosta no Sudeste). Em momentos de calamidade pública, a comunicação entre Defesa Civil, voluntários civis, abrigos municipais e estoques de doações colapsa devido à centralização e falta de sincronização em tempo real.

### 1.2 Referências Científicas e Oficiais
1. **CEMADEN (Centro Nacional de Monitoramento e Alertas de Desastres Naturais):** Relatórios de vulnerabilidade da população em áreas de risco no Brasil.
2. **IPCC / ONU:** *Sixth Assessment Report (AR6) - Climate Change 2023: Impacts, Adaptation and Vulnerability*.
3. **Defesa Civil Nacional (MDR):** *Manual de Gestão de Desastres e Abrigos Temporários*.
4. **IBGE:** *População em Áreas de Risco no Brasil: Mapeamento de Suscetibilidade a Deslizamentos e Inundações*.

### 1.3 Métricas de Impacto Social
* Tempo médio de resposta entre o chamado de socorro e a alocação de abrigo/equipe.
* Taxa de ocupação equilibrada de abrigos (evitando superlotação em um e vacância em outro).
* Desperdício zero de donativos perecíveis e kits de sobrevivência.

### 1.4 Arquitetura Proposta

#### Microsserviços e Bancos:
1. **`Incident-Alert-Service`**
   * *Responsabilidade:* Recebimento, triagem e geolocalização de chamados de socorro e alertas meteorológicos.
   * *Banco:* MongoDB ou PostgreSQL + PostGIS (consultas geoespaciais).
2. **`Shelter-Capacity-Service`**
   * *Responsabilidade:* Gestão de abrigos temporários, controle de lotação, leitos, vagas para PCD e famílias.
   * *Banco:* PostgreSQL.
3. **`Supply-Logistics-Service`**
   * *Responsabilidade:* Controle de estoque de doações críticas (água potável, colchões, remédios, kits de higiene) em centros de distribuição.
   * *Banco:* MySQL ou PostgreSQL.
4. **`Volunteer-Dispatch-Service`**
   * *Responsabilidade:* Gestão de voluntários e equipes de resgate por capacitação (socorristas, barqueiros, médicos) e despacho para missões.
   * *Banco:* PostgreSQL.

#### Clientes e BFFs:
* **Cliente A (Cidadão / Vítima / Voluntário de Campo):** Interface Web Mobile PWA leve, de baixo consumo de dados e botões de pânico acessíveis.
  * **BFF A:** Otimiza payloads, comprime imagens de ocorrências e prioriza latência baixa em redes 3G/4G degradadas.
* **Cliente B (Central de Comando da Defesa Civil / Gestor de Abrigo):** Dashboard Web para desktop com mapa de calor, telemetria em tempo real e tabelas analíticas.
  * **BFF B:** Agrega métricas consolidadas, dados de satélite/clima e relatórios de ocupação regional.

#### Transação SAGA ($\ge 3$ serviços)
* **Caso de Uso:** *Despacho de Missão Emergencial de Resgate e Acolhimento*.
  1. `Incident-Alert-Service`: Abre solicitação de evacuação para uma comunidade ilhada (ex: 20 pessoas).
  2. `Shelter-Capacity-Service`: Bloqueia/reserva 20 vagas no abrigo regional mais próximo.
  3. `Supply-Logistics-Service`: Separa 20 kits de emergência no centro de distribuição mais próximo.
  4. `Volunteer-Dispatch-Service`: Aloca equipe com barcos/viatura para a missão.
* **Cenário de Falha e Compensação:** Se o `Volunteer-Dispatch-Service` não encontrar nenhuma equipe disponível no raio de ação dentro do tempo limite:
  * Cancela a reserva dos kits no `Supply-Logistics-Service` (reintegrando ao estoque).
  * Desfaz a reserva dos leitos no `Shelter-Capacity-Service` (liberando vagas para outros desabrigados).
  * Marca a ocorrência como `ESCALADA_PARA_FORCAS_ARMADAS` no `Incident-Alert-Service`.

#### Aplicação de CQRS
* No **`Incident-Alert-Service`** ou **`Shelter-Capacity-Service`**:
  * *Write Model:* Transacional (inclusão de ocorrências, check-in de famílias).
  * *Read Model:* Base de leitura desnormalizada (Elasticsearch ou tabela desnormalizada em Redis/Postgres) com agregações por bairro, mapa de densidade e status em tempo real sem onerar o banco relacional de escrita.

#### Integração de LLM (RAG + LangChain)
* **Base de Conhecimento (RAG):** Manuais da Defesa Civil Nacional, protocolos de primeiros socorros em água contaminada, prevenção de leptospirose e cartilhas de acolhimento psicológico.
* **LangChain Tool:** Assistente virtual inteligente para socorristas e cidadãos. Exemplo de tool: `consultar_leitos_disponiveis(bairro, pcd=True)` ou `verificar_pontos_coleta_doacao()`.
* **Resiliência:** Circuit breaker e cache de respostas para perguntas frequentes em caso de instabilidade na conexão com a provedora de IA.

---

## Proposta 2: FarmaSolidária
> **Plataforma Distribuída de Redistribuição Segura de Medicamentos de Alto Custo**

### 2.1 Contexto e Problema Social
Pacientes de baixa renda com doenças crônicas ou raras sofrem com filas e desabastecimento de medicamentos de alto custo no SUS. Ao mesmo tempo, famílias que encerram tratamentos descartam incorretamente milhares de caixas de remédios lacrados dentro do prazo de validade, gerando poluição ambiental e desperdício de vidas.

### 2.2 Referências Científicas e Oficiais
1. **ANVISA:** Resoluções sobre descarte seguro de medicamentos e boas práticas de dispensação farmacêutica.
2. **Ministério da Saúde:** Relatórios do Componente Especializado da Assistência Farmacêutica (CEAF).
3. **Conselho Federal de Farmácia (CFF):** Diretrizes para Farmácias Solidárias no Brasil.
4. **Fiocruz:** Estudos sobre impacto do desabastecimento de fármacos essenciais e desperdício de insumos de saúde.

### 2.3 Métricas de Impacto Social
* Quantidade e valor financeiro de remédios de alto custo resgatados e doados.
* Redução no tempo de espera do paciente carente por um remédio prescrito.
* Descarte ecológico orientado de medicamentos vencidos.

### 2.4 Arquitetura Proposta

#### Microsserviços e Bancos:
1. **`Prescription-Validation-Service`**
   * *Responsabilidade:* Validação digital de receitas médicas (CRM, assinatura digital, dosagem, carência social do paciente).
   * *Banco:* PostgreSQL.
2. **`Inventory-Batch-Service`**
   * *Responsabilidade:* Controle minucioso de lotes recebidos, datas de validade, fabricante e regras de armazenamento (ex.: temperatura de 2 a 8°C).
   * *Banco:* MongoDB ou PostgreSQL.
3. **`Dispensing-Center-Service`**
   * *Responsabilidade:* Gestão dos polos de farmácias populares/ONGs conveniadas e triagem física presencial pelo farmacêutico responsável.
   * *Banco:* MySQL.
4. **`Cold-Chain-Logistics-Service`**
   * *Responsabilidade:* Agendamento e rastreamento do transporte seguro de remédios termolábeis (cadeia de frio) com controle de temperatura e lacre.
   * *Banco:* PostgreSQL.

#### Clientes e BFFs:
* **Cliente A (Paciente / Doador):** Web/Mobile acessível onde o doador cadastra o lote lacrado ou o paciente envia a receita e faz o pedido.
  * **BFF A:** Simplifica requisições, mascara dados sensíveis (LGPD médica) e entrega status amigável do pedido.
* **Cliente B (Farmacêutico Responsável / Órgão Regulador):** Portal Web com conferência de códigos de barras, laudos de lote e controle sanitário.
  * **BFF B:** Fornece rastreabilidade completa de lotes, validação de CRM e relatórios de conformidade regulatória.

#### Transação SAGA ($\ge 3$ serviços)
* **Caso de Uso:** *Reserva, Conferência e Despacho de Medicamento de Alto Custo*.
  1. `Prescription-Validation-Service`: Valida a receita e aprova a elegibilidade do paciente.
  2. `Inventory-Batch-Service`: Aloca e trava o lote específico do medicamento em estoque.
  3. `Cold-Chain-Logistics-Service`: Agenda a rota de transporte com caixa térmica e sensor.
* **Cenário de Falha e Compensação:** Se a transportadora falhar em disponibilizar caixa refrigerada na data limite:
  * Destrava o lote do medicamento no `Inventory-Batch-Service` (voltando ao catálogo público).
  * Notifica o `Prescription-Validation-Service` para manter a receita ativa e reordenar na fila de espera.

#### Aplicação de CQRS
* No **`Inventory-Batch-Service`**:
  * *Write Model:* Transações atômicas de entrada de doações, triagens e baixas de estoque por lote.
  * *Read Model:* Catálogo indexado para consultas rápidas de pacientes e médicos (busca por princípio ativo, fabricante, dosagem e distância geográfica).

#### Integração de LLM (RAG + LangChain)
* **Base de Conhecimento (RAG):** Bulário eletrônico da ANVISA, tabela de preços de referência CMED, Protocolos Clínicos e Diretrizes Terapêuticas (PCDT) do SUS.
* **LangChain Tool:** Assistente farmacêutico virtual com ferramenta `verificar_estoque_principio_ativo(nome, dosagem)` e verificação de interações medicamentosas a partir da receita enviada.
* **Resiliência:** Timeout + Retry com exponential backoff e fallback para mensagem padrão informativa se a API da LLM estiver indisponível.

---

## Proposta 3: PratoCheio / ColheitaSolidária
> **Plataforma de Resgate e Distribuição de Excedentes de Alimentos para Cozinhas Comunitárias**

### 3.1 Contexto e Problema Social
Mais de 30% dos alimentos produzidos no Brasil são perdidos ou desperdiçados em feiras livres, centrais de abastecimento (CEASAs) e supermercados, enquanto milhões de pessoas enfrentam insegurança alimentar. O principal gargalo é a ausência de logística ágil para recolher o alimento perecível antes que ele estrague.

### 3.2 Referências Científicas e Oficiais
1. **FAO / ONU:** *The State of Food Security and Nutrition in the World (SOFI)*.
2. **Rede PENSSAN:** Inquérito Nacional sobre Insegurança Alimentar no Contexto da Pandemia de COVID-19 no Brasil.
3. **Lei Federal nº 14.016/2020:** Dispõe sobre o combate ao desperdício de alimentos e a doação de excedentes para consumo humano.
4. **CEASA / Embrapa Alimentos:** Estudos sobre índice de perecibilidade e desperdício pós-colheita no varejo alimentar.

### 3.3 Métricas de Impacto Social
* Toneladas de alimentos próprios para consumo salvas do aterro sanitário.
* Número de refeições balanceadas viabilizadas para cozinhas comunitárias.
* Redução de emissão de gás metano decorrente da decomposição de lixo orgânico.

### 3.4 Arquitetura Proposta

#### Microsserviços e Bancos:
1. **`Surplus-Listing-Service`**
   * *Responsabilidade:* Cadastro por feirantes/mercados de lotes de frutas, legumes, verduras e grãos próximos da data de consumo.
   * *Banco:* PostgreSQL.
2. **`Community-Kitchen-Service`**
   * *Responsabilidade:* Gestão de cozinhas solidárias cadastradas, capacidade de preparo diário e público atendido.
   * *Banco:* MongoDB.
3. **`Food-Safety-Service`**
   * *Responsabilidade:* Checklist de conformidade sanitária, critérios de aceitação da Lei 14.016/2020 e cálculo do tempo máximo de transporte até o consumo.
   * *Banco:* PostgreSQL.
4. **`Routing-Logistics-Service`**
   * *Responsabilidade:* Otimização de rotas de frete solidário (motoristas parceiros, vans de ONGs) para recolhimento rápido.
   * *Banco:* PostgreSQL + PostGIS.

#### Clientes e BFFs:
* **Cliente A (Doador / Cozinha Comunitária):** App rápido para cadastro de excedentes em poucos cliques ou solicitação de marmitas do dia.
  * **BFF A:** Otimizado para formulários rápidos com fotos de alimentos e push notifications.
* **Cliente B (Coordenador de Logística / Nutricionista de ONG):** Painel operacional para montagem de cardápios, acompanhamento de coletas em mapa e relatórios nutricionais.
  * **BFF B:** Métricas de impacto em toneladas, agregação de rotas e balanço nutricional.

#### Transação SAGA ($\ge 3$ serviços)
* **Caso de Uso:** *Reserva e Despacho de Lote Perecível de Alimento*.
  1. `Community-Kitchen-Service`: Cozinha solicita carga de hortifrúti compatível com sua demanda do dia.
  2. `Surplus-Listing-Service`: Trava o lote disponível no supermercado parceiro.
  3. `Food-Safety-Service`: Valida se o tempo de transporte restante é inferior ao limite de perecibilidade.
  4. `Routing-Logistics-Service`: Aloca o motorista parceiro para a rota.
* **Cenário de Falha e Compensação:** Se o `Food-Safety-Service` rejeitar o lote (ex.: lote vence em poucas horas e nenhuma rota atende a tempo) ou a logística falhar:
  * Destrava o lote no `Surplus-Listing-Service` para possível destinação a compostagem.
  * Libera a cota da cozinha no `Community-Kitchen-Service` para que ela receba doação de outro parceiro.

#### Aplicação de CQRS
* No **`Surplus-Listing-Service`**:
  * *Write Model:* Inserções e baixas rápidas de caixas de alimentos feitas pelos doadores.
  * *Read Model:* Catálogo geoespacial atualizado periodicamente para mostrar ofertas disponíveis num raio de X km com filtros de perecibilidade.

#### Integração de LLM (RAG + LangChain)
* **Base de Conhecimento (RAG):** Resolução RDC nº 216 da ANVISA (Boas Práticas para Serviços de Alimentação), Tabela Brasileira de Composição de Alimentos (TACO/Unicamp), receitas de aproveitamento integral de alimentos.
* **LangChain Tool:** Assistente nutricional inteligente com a ferramenta `consultar_ingredientes_disponiveis(cozinha_id)` para planejar cardápios nutritivos a partir dos lotes recolhidos no dia.
* **Resiliência:** Cache semântico de cardápios e fallback caso o modelo de IA fique indisponível.

---

## Comparativo para Escolha

| Critério | SOS-Clima (Desastres) | FarmaSolidária (Remédios) | PratoCheio (Alimentos) |
| :--- | :---: | :---: | :---: |
| **Aderência aos Requisitos Técnicos** | Excelente (10/10) | Excelente (10/10) | Excelente (10/10) |
| **Clareza da SAGA e Compensações** | Alta (alocação de leitos/equipes) | Muito Alta (reserva de lotes/frete frio) | Alta (reserva de insumos/rotas) |
| **Facilidade de RAG e Manuais Oficiais** | Alta (Defesa Civil / IPCC) | Muito Alta (ANVISA / Bulas / SUS) | Alta (ANVISA / TACO) |
| **Apelo de Demonstração Visual** | Alto (mapas, alertas e leitos) | Alto (auditoria de lotes e receitas) | Alto (mapas de rotas e cardápios) |
