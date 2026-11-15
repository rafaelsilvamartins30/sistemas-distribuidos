export interface EntityPost {
  id: string;
  title: string;
  body: string;
  date: string;
  author?: string;
  authorRole?: string;
  comments?: number;
  pinned?: boolean;
  eventId?: string;
}

export interface Entity {
  id: string;
  name: string;
  initials: string;
  type: string;
  category: string;
  description: string;
  location: string;
  members: string;
  tone: string;
  spaceKind?: "entity" | "community";
  followed?: boolean;
  managers?: string[];
  posts: EntityPost[];
}

export const entities: Entity[] = [
  {
    id: "dcc",
    name: "Departamento de Ciência da Computação",
    initials: "DCC",
    type: "Departamento",
    category: "Ensino e pesquisa",
    description: "Informações, atividades acadêmicas e projetos ligados à Computação na UFLA.",
    location: "Câmpus Universitário · Lavras",
    members: "Comunidade acadêmica",
    tone: "green",
    posts: [
      {
        id: "dcc-about",
        title: "Sobre o departamento",
        body: "Acompanhe comunicados, atividades e oportunidades relacionadas ao Departamento de Ciência da Computação.",
        date: "Fixado",
        pinned: true,
        author: "Prof. Carlos Eduardo",
        authorRole: "Gestor do departamento",
      },
      {
        id: "dcc-git",
        title: "Workshop de Git e GitHub",
        body: "Inscrições abertas para uma atividade prática sobre controle de versão. Vagas limitadas.",
        date: "Hoje",
        eventId: "workshop-git",
        author: "Marina Costa",
        authorRole: "Manager",
      },
      {
        id: "dcc-monitoria",
        title: "Seleção para monitoria de Algoritmos",
        body: "O edital e os critérios de participação estão disponíveis na página de oportunidades.",
        date: "Ontem",
        author: "Ana Ribeiro",
        authorRole: "Professora",
      },
    ],
  },
  {
    id: "emakers",
    name: "Emakers Jr.",
    initials: "E",
    type: "Empresa júnior",
    category: "Empreendedorismo e tecnologia",
    description: "Empresa júnior de tecnologia que conecta estudantes a projetos, inovação e experiências práticas.",
    location: "UFLA · Lavras",
    members: "Estudantes e colaboradores",
    tone: "blue",
    posts: [
      {
        id: "emakers-about",
        title: "Conheça a Emakers",
        body: "Somos uma iniciativa estudantil de tecnologia e empreendedorismo. Este espaço reúne novidades e atividades abertas.",
        date: "Fixado",
        pinned: true,
        author: "Rafael Martins",
        authorRole: "Presidente",
      },
      {
        id: "emakers-talk",
        title: "Inscrições para a conversa sobre IA",
        body: "A atividade é aberta a estudantes de todos os cursos. Confira data, local e disponibilidade na página do evento.",
        date: "Hoje",
        eventId: "talk-ai",
        author: "Júlia Mendes",
        authorRole: "Manager",
      },
      {
        id: "emakers-visita",
        title: "Visita aberta nesta semana",
        body: "Vamos apresentar nossos projetos e conversar sobre como participar da empresa júnior.",
        date: "Há 2 dias",
        author: "Pedro Nascimento",
        authorRole: "Diretor de projetos",
      },
    ],
  },
  {
    id: "atletica",
    name: "Associação Atlética Acadêmica da UFLA",
    initials: "A",
    type: "Atlética",
    category: "Esporte e integração",
    description: "Organiza atividades esportivas e encontros de integração para a comunidade universitária.",
    location: "Câmpus Universitário · Lavras",
    members: "Comunidade universitária",
    tone: "orange",
    posts: [
      {
        id: "atletica-about",
        title: "Esporte e integração",
        body: "Acompanhe campeonatos, treinos e atividades de integração organizados pela Atlética.",
        date: "Fixado",
        pinned: true,
        author: "Lucas Almeida",
        authorRole: "Presidente",
      },
      {
        id: "atletica-futsal",
        title: "Inscrições abertas para o Intercursos de Futsal",
        body: "Equipes podem se inscrever até 20 de outubro. Também há opção de entrar como agente livre.",
        date: "Hoje",
        eventId: "intercursos-futsal",
        author: "Marina Costa",
        authorRole: "Manager",
      },
      {
        id: "atletica-open",
        title: "Treino aberto de vôlei",
        body: "Encontro para quem quer conhecer o grupo e jogar sem compromisso de competição.",
        date: "Há 3 dias",
        author: "João Victor",
        authorRole: "Coordenador esportivo",
      },
    ],
  },
  {
    id: "pet",
    name: "PET Computação",
    initials: "P",
    type: "Programa acadêmico",
    category: "Ensino, pesquisa e extensão",
    description: "Programa de educação tutorial com atividades de ensino, pesquisa e extensão em Computação.",
    location: "Departamento de Ciência da Computação · UFLA",
    members: "Estudantes e tutoria",
    tone: "violet",
    posts: [
      {
        id: "pet-about",
        title: "O que é o PET Computação?",
        body: "O programa desenvolve atividades que aproximam ensino, pesquisa e extensão na universidade.",
        date: "Fixado",
        pinned: true,
        author: "Prof. André Luiz",
        authorRole: "Tutor",
      },
      {
        id: "pet-visit",
        title: "Visita ao laboratório de robótica",
        body: "A visita é gratuita e aberta a estudantes interessados. Consulte os horários e faça sua inscrição.",
        date: "Ontem",
        eventId: "robotics-visit",
        author: "Camila Souza",
        authorRole: "Petiana",
      },
    ],
  },
];

export interface DemoEvent {
  id: string;
  title: string;
  type: string;
  date: string;
  day: string;
  month: string;
  time: string;
  location: string;
  organizerId: string;
  description: string;
  status: string;
  vacancies: string;
  price?: string;
  sports?: boolean;
  sportsLevel?: "Recreativo" | "Competitivo";
  registration: "individual" | "team" | "team-or-free-agent" | "none";
}

export const events: DemoEvent[] = [
  {
    id: "workshop-git",
    title: "Workshop de Git e GitHub",
    type: "Oficina",
    date: "18 de outubro de 2026",
    day: "18",
    month: "OUT",
    time: "14h às 17h",
    location: "Pavilhão de Aulas 6 · Laboratório 3",
    organizerId: "dcc",
    description: "Atividade prática para aprender o fluxo básico de versionamento, branches e colaboração em projetos.",
    status: "Inscrições abertas",
    vacancies: "12 vagas",
    registration: "individual",
  },
  {
    id: "talk-ai",
    title: "Conversa sobre Inteligência Artificial",
    type: "Palestra",
    date: "22 de outubro de 2026",
    day: "22",
    month: "OUT",
    time: "19h às 20h30",
    location: "Anfiteatro do DCC",
    organizerId: "emakers",
    description:
      "Uma conversa introdutória sobre aplicações de inteligência artificial e caminhos para estudar o tema.",
    status: "Inscrições abertas",
    vacancies: "Vagas disponíveis",
    registration: "individual",
  },
  {
    id: "university-week",
    title: "Semana de Ciência, Cultura e Arte",
    type: "Festival universitário",
    date: "21 a 25 de outubro de 2026",
    day: "21",
    month: "OUT",
    time: "Programação ao longo do dia",
    location: "Vários espaços do câmpus",
    organizerId: "dcc",
    description: "Programação universitária com atividades culturais, apresentações e encontros abertos à comunidade.",
    status: "Entrada gratuita",
    vacancies: "Sem inscrição",
    registration: "none",
  },
  {
    id: "intercursos-futsal",
    title: "Intercursos de Futsal",
    type: "Campeonato",
    date: "A partir de 2 de novembro de 2026",
    day: "02",
    month: "NOV",
    time: "Jogos à noite",
    location: "Ginásio da UFLA",
    organizerId: "atletica",
    description: "Campeonato entre cursos. Forme uma equipe ou manifeste interesse para entrar como agente livre.",
    status: "Inscrições abertas",
    vacancies: "4 vagas para equipes",
    price: "Gratuito",
    sports: true,
    sportsLevel: "Competitivo",
    registration: "team-or-free-agent",
  },
  {
    id: "robotics-visit",
    title: "Visita ao laboratório de robótica",
    type: "Visita",
    date: "24 de outubro de 2026",
    day: "24",
    month: "OUT",
    time: "10h às 11h30",
    location: "Laboratório de Robótica · DCC",
    organizerId: "pet",
    description: "Conheça projetos de robótica desenvolvidos na universidade e converse com estudantes do laboratório.",
    status: "Inscrições abertas",
    vacancies: "8 vagas",
    registration: "individual",
  },
  {
    id: "volleyball-open",
    title: "Treino aberto de vôlei",
    type: "Treino",
    date: "27 de outubro de 2026",
    day: "27",
    month: "OUT",
    time: "18h às 20h",
    location: "Quadra coberta da UFLA",
    organizerId: "atletica",
    description: "Treino recreativo para conhecer o grupo e jogar. Não é necessário ter equipe formada.",
    status: "Aberto a participantes",
    vacancies: "Sem limite de vagas",
    price: "Gratuito",
    sports: true,
    sportsLevel: "Recreativo",
    registration: "individual",
  },
  {
    id: "basketball-season",
    title: "Temporada de Basquete",
    type: "Temporada",
    date: "A partir de 3 de novembro de 2026",
    day: "03",
    month: "NOV",
    time: "Terças e quintas · 19h",
    location: "Quadra externa da UFLA",
    organizerId: "atletica",
    description:
      "Encontros semanais organizados por estudantes. A temporada é aberta a novas equipes e agentes livres.",
    status: "Inscrições abertas",
    vacancies: "2 vagas",
    price: "Gratuito",
    sports: true,
    sportsLevel: "Recreativo",
    registration: "team-or-free-agent",
  },
  {
    id: "campus-running",
    title: "Grupo de Corrida do Câmpus",
    type: "Atividade aberta",
    date: "Encontros semanais",
    day: "29",
    month: "OUT",
    time: "Quartas · 7h",
    location: "Entrada principal da UFLA",
    organizerId: "pet",
    description: "Grupo de corrida leve no câmpus, aberto a iniciantes e pessoas experientes.",
    status: "Aberto a participantes",
    vacancies: "Sem limite de vagas",
    price: "Gratuito",
    sports: true,
    sportsLevel: "Recreativo",
    registration: "individual",
  },
  {
    id: "dcc-welcome-coffee",
    title: "Café de integração do DCC",
    type: "Encontro",
    date: "8 de outubro de 2026",
    day: "08",
    month: "OUT",
    time: "16h às 17h30",
    location: "Centro de Convivência",
    organizerId: "dcc",
    description: "Encontro de integração para estudantes e pessoas do departamento no início do semestre.",
    status: "Evento concluído",
    vacancies: "Presença registrada",
    price: "Gratuito",
    registration: "individual",
  },
];

export interface SportListing {
  id: string;
  eventId: string;
  sport: string;
  level: string;
  format: "Campeonato" | "Temporada" | "Atividade aberta";
  description: string;
  vacancies: string;
  organizerId: string;
  kind: "team-or-free-agent" | "individual";
}

export const sports: SportListing[] = [
  {
    id: "futsal",
    eventId: "intercursos-futsal",
    sport: "Futsal",
    level: "Competitivo",
    format: "Campeonato",
    description: "Disputa entre cursos da UFLA. Inscreva uma equipe ou deixe seu nome para encontrar um time.",
    vacancies: "4 equipes",
    organizerId: "atletica",
    kind: "team-or-free-agent",
  },
  {
    id: "volleyball",
    eventId: "volleyball-open",
    sport: "Vôlei",
    level: "Recreativo",
    format: "Atividade aberta",
    description: "Treino aberto para jogar e conhecer outras pessoas, sem necessidade de equipe.",
    vacancies: "Sem limite de vagas",
    organizerId: "atletica",
    kind: "individual",
  },
  {
    id: "basketball-season",
    eventId: "basketball-season",
    sport: "Basquete",
    level: "Recreativo",
    format: "Temporada",
    description: "Encontros semanais organizados por estudantes. A lista de participantes está aberta.",
    vacancies: "2 vagas",
    organizerId: "atletica",
    kind: "team-or-free-agent",
  },
  {
    id: "running",
    eventId: "campus-running",
    sport: "Corrida",
    level: "Todos os níveis",
    format: "Atividade aberta",
    description: "Grupo de corrida leve no câmpus, aberto a iniciantes e pessoas experientes.",
    vacancies: "Sem limite de vagas",
    organizerId: "pet",
    kind: "individual",
  },
];

export interface DemoOpportunity {
  id: string;
  title: string;
  type: string;
  publisher: string;
  publisherId?: string;
  description: string;
  eligibility: string;
  selection: string;
  deadline: string;
  location: string;
  action: string;
}

export const opportunities: DemoOpportunity[] = [
  {
    id: "research-scholarship",
    title: "Bolsa em visão computacional",
    type: "Bolsa de pesquisa",
    publisher: "Profa. Ana Ribeiro · DCC",
    publisherId: "dcc",
    description: "Atuação em projeto de pesquisa com análise de imagens e aprendizado de máquina.",
    eligibility: "Estudantes de graduação com interesse em programação e inteligência artificial.",
    selection: "Análise de histórico e conversa com a responsável pelo projeto.",
    deadline: "Até 24 de outubro",
    location: "UFLA · Presencial",
    action: "Tenho interesse",
  },
  {
    id: "algorithms-monitor",
    title: "Monitoria de Algoritmos",
    type: "Processo seletivo",
    publisher: "Departamento de Ciência da Computação",
    publisherId: "dcc",
    description: "Apoio às aulas, plantões de dúvidas e atividades da disciplina de Algoritmos.",
    eligibility: "Estudantes que já cursaram a disciplina e atendem aos critérios do edital.",
    selection: "Processo seletivo por edital; classificação conforme os critérios publicados.",
    deadline: "Até 20 de outubro",
    location: "UFLA · Presencial",
    action: "Ver processo",
  },
  {
    id: "extension-volunteer",
    title: "Tecnologia para a comunidade",
    type: "Extensão",
    publisher: "PET Computação",
    publisherId: "pet",
    description: "Participe de ações de inclusão digital e atividades com a comunidade local.",
    eligibility: "Estudantes de qualquer curso com disponibilidade para encontros semanais.",
    selection: "Entrada por manifestação de interesse e conversa com a equipe.",
    deadline: "Inscrições contínuas",
    location: "Lavras · Presencial",
    action: "Quero participar",
  },
  {
    id: "software-internship",
    title: "Estágio em desenvolvimento de software",
    type: "Estágio",
    publisher: "Núcleo de Tecnologia",
    description: "Experiência prática em desenvolvimento web, com acompanhamento de uma equipe técnica.",
    eligibility: "Estudantes de graduação com conhecimentos básicos de desenvolvimento web.",
    selection: "Processo seletivo da organização responsável. Etapas informadas no formulário de inscrição.",
    deadline: "Até 31 de outubro",
    location: "Lavras · Híbrido",
    action: "Ver processo",
  },
];

export function findEntity(id: string | undefined): Entity | undefined {
  return entities.find((entity) => entity.id === id);
}

export function findEvent(id: string | undefined): DemoEvent | undefined {
  return events.find((event) => event.id === id);
}

// Dados locais usados para desenhar a experiência; nenhuma tela consulta um serviço.
export const mockUniversity = {
  name: "Universidade Federal de Lavras",
  shortName: "UFLA",
  location: "Lavras · Minas Gerais",
  message: "Conhecimento, encontros e oportunidades para viver a universidade por inteiro.",
};

export const mockCurrentUser = {
  name: "Rafael Silva Martins",
  email: "rafael@unir.local",
  registration: "202420228",
  course: "Sistemas de Informação",
  department: "Departamento de Ciência da Computação",
  level: "Graduação",
  status: "Aluno",
  interests: ["Engenharia de Software", "Segurança de Software"],
  theme: "Claro · Brasa",
};

export const mockAnnouncements = [
  {
    id: "enrollment",
    category: "Vida acadêmica",
    title: "Período de matrícula aberto",
    summary: "Confira as datas e orientações para organizar sua matrícula neste semestre.",
    date: "Até 18 de outubro",
  },
  {
    id: "dining-hall",
    category: "Serviços do câmpus",
    title: "Funcionamento do Restaurante Universitário",
    summary: "Veja os horários de atendimento do RU durante a semana de atividades acadêmicas.",
    date: "Atualizado hoje",
  },
  {
    id: "university-week",
    category: "Universidade",
    title: "Semana de Ciência, Cultura e Arte",
    summary: "A programação institucional reúne atividades abertas à comunidade universitária.",
    date: "21 a 25 de outubro",
  },
];

export const communities: Entity[] = [
  {
    id: "community-rpg",
    name: "Comunidade de RPG",
    initials: "RPG",
    type: "Comunidade",
    category: "Jogos e cultura",
    spaceKind: "community",
    followed: true,
    description: "Um espaço para encontrar grupos, trocar ideias e jogar RPG de mesa no câmpus.",
    location: "UFLA · Lavras",
    members: "42 participantes",
    tone: "violet",
    managers: ["Júlia Mendes", "Pedro Nascimento"],
    posts: [
      {
        id: "rpg-about",
        title: "Boas-vindas à comunidade",
        body: "Este espaço conecta quem joga, quer começar ou deseja conhecer sistemas diferentes de RPG de mesa.",
        date: "Fixado",
        pinned: true,
        author: "Júlia Mendes",
        authorRole: "Moderadora",
      },
      {
        id: "rpg-session",
        title: "Mesa aberta neste sábado",
        body: "Vamos fazer uma sessão introdutória de fantasia. Temos espaço para mais três pessoas iniciantes.",
        date: "Há 3 horas",
        author: "Pedro Nascimento",
        authorRole: "Membro",
        comments: 5,
      },
    ],
  },
  {
    id: "community-boleiros",
    name: "Comunidade de Boleiros",
    initials: "CB",
    type: "Comunidade",
    category: "Esporte e integração",
    spaceKind: "community",
    followed: true,
    description: "Combine partidas recreativas, encontre pessoas para completar o time e curta o esporte.",
    location: "Câmpus Universitário · Lavras",
    members: "86 participantes",
    tone: "green",
    managers: ["Lucas Almeida"],
    posts: [
      {
        id: "boleiros-about",
        title: "Futebol para todo mundo",
        body: "Um espaço aberto para organizar partidas informais e conhecer gente nova. A proposta é recreativa.",
        date: "Fixado",
        pinned: true,
        author: "Lucas Almeida",
        authorRole: "Moderador",
      },
      {
        id: "boleiros-game",
        title: "Partida na quarta",
        body: "Vamos jogar às 18h na quadra do câmpus. Quem puder, confirma nos comentários para fecharmos os times.",
        date: "Ontem",
        author: "Marina Costa",
        authorRole: "Membro",
        comments: 8,
      },
    ],
  },
  {
    id: "community-dev",
    name: "Tecnologia e desenvolvimento",
    initials: "TD",
    type: "Comunidade",
    category: "Tecnologia",
    spaceKind: "community",
    followed: false,
    description: "Projetos, programação e troca de conhecimento entre pessoas da universidade.",
    location: "UFLA · Lavras",
    members: "128 participantes",
    tone: "blue",
    managers: ["Marina Costa"],
    posts: [
      {
        id: "dev-about",
        title: "Projetos em conjunto",
        body: "Use este espaço para encontrar pessoas, estudar e compartilhar projetos de tecnologia.",
        date: "Fixado",
        pinned: true,
        author: "Marina Costa",
        authorRole: "Moderadora",
      },
      {
        id: "dev-study",
        title: "Grupo de estudos de desenvolvimento web",
        body: "A ideia é escolher um tema por semana e construir pequenos projetos juntos. Quem anima?",
        date: "Há 2 horas",
        author: "Marina Costa",
        authorRole: "Membro",
        comments: 6,
      },
    ],
  },
];

export const spaces: Entity[] = [...entities, ...communities];

export function findSpace(id: string | undefined): Entity | undefined {
  return spaces.find((space) => space.id === id);
}

export function spacePath(space: Entity): string {
  return space.spaceKind === "community" ? `/espacos/${space.id}` : `/entidades/${space.id}`;
}

export const mockFollowedSpaceIds = ["dcc", "emakers", "atletica", "pet", "community-rpg", "community-boleiros"];

export type RegistrationStatus = "Pendente" | "Confirmada" | "Cancelada" | "Concluída";
export type RegistrationMode = "Individual" | "Equipe" | "Agente livre";
export const mockRegistrations: {
  id: string;
  eventId: string;
  status: RegistrationStatus;
  access: "Ativo" | "Presença registrada" | "Expirado";
  mode?: RegistrationMode;
}[] = [
  { id: "registration-git", eventId: "workshop-git", status: "Confirmada", access: "Ativo", mode: "Individual" },
  { id: "registration-ai", eventId: "talk-ai", status: "Pendente", access: "Ativo", mode: "Individual" },
  {
    id: "registration-coffee",
    eventId: "dcc-welcome-coffee",
    status: "Concluída",
    access: "Presença registrada",
    mode: "Individual",
  },
  { id: "registration-week", eventId: "university-week", status: "Cancelada", access: "Expirado" },
];

export function addMockRegistration(eventId: string, mode: RegistrationMode): boolean {
  const previous = mockRegistrations.find((registration) => registration.eventId === eventId);
  if (previous && previous.status !== "Cancelada") return false;
  if (previous) {
    previous.status = "Pendente";
    previous.access = "Ativo";
    previous.mode = mode;
    return true;
  }
  mockRegistrations.unshift({ id: `registration-${eventId}`, eventId, status: "Pendente", access: "Ativo", mode });
  return true;
}

export const mockNotifications = [
  { id: "dcc-posts", spaceId: "dcc", label: "Novas publicações do DCC", detail: "Comunicados e posts", enabled: true },
  {
    id: "atletica-events",
    spaceId: "atletica",
    label: "Eventos da Atlética",
    detail: "Inscrições e alterações",
    enabled: true,
  },
  {
    id: "emakers-opportunities",
    spaceId: "emakers",
    label: "Oportunidades da Emakers",
    detail: "Projetos e processos seletivos",
    enabled: false,
  },
  {
    id: "rpg-posts",
    spaceId: "community-rpg",
    label: "Publicações da Comunidade de RPG",
    detail: "Conversas e encontros",
    enabled: true,
  },
];

export const mockAdminScopes = [
  {
    id: "ufla",
    name: "Universidade Federal de Lavras",
    kind: "Universidade",
    role: "PLATFORM_ADMIN",
    canManageGlobalRoles: true,
  },
  {
    id: "dcc",
    name: "Departamento de Ciência da Computação",
    kind: "Departamento",
    role: "SCOPE_ADMIN",
    canManageGlobalRoles: false,
  },
  { id: "emakers", name: "Emakers Jr.", kind: "Entidade acadêmica", role: "ENTITY_ADMIN", canManageGlobalRoles: false },
];

export const mockAdminStructures = {
  ufla: [
    "Departamento de Ciência da Computação",
    "Departamento de Administração",
    "Emakers Jr.",
    "Atlética UFLA",
    "Comunidade de RPG · aguardando revisão",
  ],
  dcc: ["Sistemas de Informação", "Ciência da Computação", "PET Computação", "Laboratório de Robótica"],
  emakers: ["Projetos", "Diretoria", "Oportunidades abertas"],
};

export const mockAdministrators = {
  ufla: ["Rafael Martins · Administrador da plataforma", "Marina Costa · Administradora"],
  dcc: ["Prof. Carlos Eduardo · Administrador do departamento", "Ana Ribeiro · Gestora"],
  emakers: ["Júlia Mendes · Administradora da entidade", "Pedro Nascimento · Gestor"],
};

export const mockAdminAnnouncements = [
  {
    id: "admin-enrollment",
    title: "Período de matrícula aberto",
    date: "Publicado · 13 out. 2026",
    status: "Publicado",
  },
  {
    id: "admin-ru",
    title: "Funcionamento do Restaurante Universitário",
    date: "Atualizado · 12 out. 2026",
    status: "Publicado",
  },
];
