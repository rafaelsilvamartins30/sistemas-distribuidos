import { useState } from "react";
import { Icon } from "../components/Icon";
import { mockAdminAnnouncements, mockAdminScopes, mockAdminStructures, mockAdministrators, mockUniversity } from "../data/demoContent";

const adminTabs = ["Visão geral", "Identidade visual", "Estruturas", "Permissões", "Comunicados"] as const;
type AdminTab = (typeof adminTabs)[number];

export function AdminPage() {
  const [scopeId, setScopeId] = useState(mockAdminScopes[0].id);
  const [tab, setTab] = useState<AdminTab>("Visão geral");
  const [managers, setManagers] = useState<Record<string, string[]>>(mockAdministrators);
  const [managerName, setManagerName] = useState("");
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcements, setAnnouncements] = useState(mockAdminAnnouncements);
  const [notice, setNotice] = useState("");
  const scope = mockAdminScopes.find((item) => item.id === scopeId) ?? mockAdminScopes[0];
  const structures = mockAdminStructures[scope.id as keyof typeof mockAdminStructures];

  function addManager() {
    const name = managerName.trim();
    if (!name) return;
    setManagers((current) => ({ ...current, [scope.id]: [...(current[scope.id] ?? []), `${name} · Administrador do escopo`] }));
    setManagerName("");
    setNotice("Administrador adicionado nesta prévia.");
  }

  function publishAnnouncement() {
    const title = announcementTitle.trim();
    if (!title) return;
    setAnnouncements((current) => [{ id: `draft-${Date.now()}`, title, date: "Rascunho local · agora", status: "Rascunho" }, ...current]);
    setAnnouncementTitle("");
    setNotice("Comunicado adicionado como rascunho local.");
  }

  return <div className="mock-page admin-page">
    <div className="page-heading-row"><div className="page-intro product-page-intro"><p className="eyebrow">Gestão da UNIR</p><h1>Administração</h1><p>Uma área para cuidar da universidade, dos departamentos e das entidades.</p></div><span className="preview-badge"><span aria-hidden="true" /> Prévia visual</span></div>
    <section className="admin-scope-card"><label htmlFor="admin-scope">Você está administrando</label><div className="admin-scope-select"><Icon name="communities" width="19" height="19" /><select id="admin-scope" value={scopeId} onChange={(event) => { setScopeId(event.target.value); setNotice(""); }}><option value="ufla">{mockUniversity.name}</option>{mockAdminScopes.filter((item) => item.id !== "ufla").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><span className="admin-scope-role">{scope.role}</span></div><p>O seletor simula diferentes permissões. Não há controle de acesso real nesta demonstração.</p></section>

    <div className="admin-layout">
      <nav className="admin-tabs" aria-label="Seções administrativas">{adminTabs.map((item) => <button type="button" key={item} className={tab === item ? "is-active" : ""} aria-current={tab === item ? "page" : undefined} onClick={() => { setTab(item); setNotice(""); }}>{item}</button>)}</nav>
      <main className="admin-content">
        {tab === "Visão geral" && <section className="mock-panel"><div className="mock-panel-heading"><span className="eyebrow">{scope.kind}</span><h2>{scope.name}</h2><p>Informações e atividades que estão sob responsabilidade deste escopo.</p></div><div className="admin-overview-grid"><article><span>Estruturas</span><strong>{structures.length}</strong><small>itens de exemplo</small></article><article><span>Administradores</span><strong>{(managers[scope.id] ?? []).length}</strong><small>neste escopo</small></article><article><span>Comunicados</span><strong>{announcements.filter((item) => item.status === "Publicado").length}</strong><small>publicados</small></article></div><div className="mock-subheading"><h3>Ações frequentes</h3><p>Escolha uma área para continuar a organização.</p></div><div className="admin-quick-actions">{adminTabs.slice(1).map((item) => <button key={item} type="button" onClick={() => setTab(item)}><span>{item}</span><Icon name="arrowUpRight" width="16" height="16" /></button>)}</div></section>}

        {tab === "Identidade visual" && <section className="mock-panel"><div className="mock-panel-heading"><span className="eyebrow">Identidade visual</span><h2>Informações do escopo</h2><p>Edite os dados que identificam este espaço para a comunidade.</p></div><div className="admin-banner-preview"><span className="brand-mark">U</span><div><strong>{scope.name}</strong><span>{scope.kind} · Lavras, Minas Gerais</span></div></div><div className="admin-form-grid"><label>Nome<input defaultValue={scope.name} key={`${scope.id}-name`} /></label><label>Sigla<input defaultValue={scope.id === "ufla" ? "UFLA" : scope.id.toUpperCase()} key={`${scope.id}-short`} /></label><label>Localidade<input defaultValue="Lavras · Minas Gerais" key={`${scope.id}-place`} /></label><label>Tipo de escopo<input value={scope.kind} readOnly /></label></div><label className="admin-form-label">Descrição<textarea defaultValue={scope.id === "ufla" ? mockUniversity.message : `Informações e atividades de ${scope.name}.`} key={`${scope.id}-description`} /></label><div className="admin-form-actions"><button type="button" className="button button-primary" onClick={() => setNotice("Alterações visuais salvas nesta prévia.")}>Salvar identidade</button></div></section>}

        {tab === "Estruturas" && <section className="mock-panel"><div className="mock-panel-heading"><span className="eyebrow">Organização acadêmica</span><h2>Estruturas</h2><p>Itens vinculados ao escopo selecionado.</p></div><div className="admin-structure-list">{structures.map((item, index) => <article key={item}><span className={`structure-symbol structure-symbol-${index % 4}`}><Icon name={item.includes("Comunidade") ? "communities" : "profile"} width="18" height="18" /></span><span><strong>{item}</strong><small>{item.includes("aguardando") ? "Comunidade · em análise" : index === 0 && scope.id === "ufla" ? "Departamento" : "Estrutura vinculada"}</small></span>{item.includes("aguardando") && <button type="button" className="button button-secondary" onClick={() => setNotice("A estrutura foi aprovada nesta prévia.")}>Revisar</button>}</article>)}</div><button type="button" className="button button-secondary" onClick={() => setNotice("O fluxo de criação de estrutura será definido depois.")}>+ Adicionar estrutura</button></section>}

        {tab === "Permissões" && <section className="mock-panel"><div className="mock-panel-heading"><span className="eyebrow">Acesso administrativo</span><h2>Administradores e permissões</h2><p>As permissões se aplicam ao escopo atual: {scope.name}.</p></div><form className="admin-add-manager" onSubmit={(event) => { event.preventDefault(); addManager(); }}><label htmlFor="manager-name">Adicionar administrador do escopo</label><div><input id="manager-name" value={managerName} onChange={(event) => setManagerName(event.target.value)} placeholder="Nome ou e-mail" /><button className="button button-primary" type="submit">Adicionar</button></div></form><div className="admin-manager-list">{(managers[scope.id] ?? []).map((manager) => <article key={manager}><span className="avatar avatar-small">{manager[0]}</span><strong>{manager}</strong><button type="button" className="text-link-button" onClick={() => { setManagers((current) => ({ ...current, [scope.id]: (current[scope.id] ?? []).filter((item) => item !== manager) })); setNotice("Administrador removido desta prévia."); }}>Remover</button></article>)}</div>{scope.canManageGlobalRoles && <div className="global-role-callout"><Icon name="shield" width="18" height="18" /><span><strong>Permissões globais</strong><small>Este escopo simula um PLATFORM_ADMIN, então pode administrar papéis globais.</small></span><button type="button" className="button button-secondary" onClick={() => setNotice("Papéis globais editados nesta prévia.")}>Gerenciar papéis</button></div>}</section>}

        {tab === "Comunicados" && <section className="mock-panel"><div className="mock-panel-heading"><span className="eyebrow">Comunicação institucional</span><h2>Comunicados</h2><p>Publique avisos para as pessoas vinculadas ao escopo.</p></div><form className="admin-announcement-form" onSubmit={(event) => { event.preventDefault(); publishAnnouncement(); }}><label htmlFor="announcement-title">Novo comunicado</label><div><input id="announcement-title" value={announcementTitle} onChange={(event) => setAnnouncementTitle(event.target.value)} placeholder="Título do comunicado" /><button className="button button-primary" type="submit">Criar rascunho</button></div></form><div className="admin-announcement-list">{announcements.map((item) => <article key={item.id}><span className="announcement-marker"><Icon name="message" width="17" height="17" /></span><span><strong>{item.title}</strong><small>{item.date}</small></span><span className={`admin-announcement-state ${item.status === "Publicado" ? "is-published" : ""}`}>{item.status}</span></article>)}</div></section>}
        {notice && <p className="inline-confirmation admin-notice" role="status">{notice}</p>}
      </main>
    </div>
  </div>;
}
