import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { communities, entities, events, findSpace, opportunities, type Entity, spacePath } from "../data/demoContent";

export function EntitiesPage() {
  const [query, setQuery] = useState("");
  const visibleEntities = useMemo(() => entities.filter((entity) => `${entity.name} ${entity.type} ${entity.category} ${entity.description}`.toLocaleLowerCase("pt-BR").includes(query.trim().toLocaleLowerCase("pt-BR"))), [query]);

  return <div className="catalog-page">
    <div className="page-heading-row"><div className="page-intro product-page-intro"><p className="eyebrow">Quem movimenta a universidade</p><h1>Entidades</h1><p>Conheça os grupos e organizações, veja o que publicam e encontre suas atividades.</p></div><span className="preview-badge"><span aria-hidden="true" /> Prévia visual</span></div>
    <section className="catalog-tools"><label className="search-field"><Icon name="search" width="18" height="18" /><span className="sr-only">Buscar entidades</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar entidade, área ou atividade" /></label></section>
    <div className="catalog-results-heading"><div><h2>Entidades acadêmicas</h2><p>{visibleEntities.length} entidades de exemplo</p></div><Link className="text-link" to="/comunidades">Explorar comunidades <Icon name="arrowUpRight" width="15" height="15" /></Link></div>
    {visibleEntities.length ? <div className="entity-directory-grid">{visibleEntities.map((entity) => <SpaceDirectoryCard key={entity.id} space={entity} />)}</div> : <div className="empty-state"><Icon name="search" /><strong>Nenhuma entidade encontrada</strong><span>Tente buscar por outro nome ou área.</span></div>}
    <div className="catalog-results-heading"><div><h2>Comunidades</h2><p>Espaços criados pela comunidade universitária</p></div></div>
    <div className="entity-directory-grid">{communities.map((community) => <SpaceDirectoryCard key={community.id} space={community} />)}</div>
  </div>;
}

function SpaceDirectoryCard({ space }: { space: Entity }) {
  const detailPath = spacePath(space);
  const isCommunity = space.spaceKind === "community";
  return <article className="entity-directory-card">
    <div className={`entity-banner entity-banner-${space.tone}`}><span>{isCommunity ? "Comunidade" : space.type}</span><span className="entity-avatar entity-avatar-large">{space.initials}</span></div>
    <div className="entity-directory-copy"><span className="eyebrow">{space.category}</span><h3><Link to={detailPath}>{space.name}</Link></h3><p>{space.description}</p><div className="entity-directory-meta"><span>{space.members}</span><span>{space.posts.filter((post) => !post.pinned).length} publicações recentes</span></div><Link className="text-link" to={detailPath}>Abrir página <Icon name="arrowUpRight" width="15" height="15" /></Link></div>
  </article>;
}

const spaceTabs = ["Visão geral", "Posts", "Eventos", "Oportunidades"] as const;
type SpaceTab = (typeof spaceTabs)[number];

export function EntityDetailPage() {
  const { entityId, spaceId } = useParams();
  const entity = findSpace(spaceId ?? entityId);
  const [following, setFollowing] = useState(entity?.followed ?? false);
  const [activeTab, setActiveTab] = useState<SpaceTab>("Visão geral");
  if (!entity) return <div className="empty-state"><strong>Espaço não encontrado</strong><Link to="/entidades">Voltar aos espaços</Link></div>;

  const isCommunity = entity.spaceKind === "community";
  const detailPath = spacePath(entity);
  const relatedEvents = events.filter((event) => event.organizerId === entity.id);
  const relatedOpportunities = opportunities.filter((opportunity) => opportunity.publisherId === entity.id);
  const postList = entity.posts;

  return <div className="entity-page">
    <Link className="back-link" to={isCommunity ? "/comunidades" : "/entidades"}><Icon name="arrowLeft" width="16" height="16" /> {isCommunity ? "Todas as comunidades" : "Todas as entidades"}</Link>
    <section className={`entity-profile-banner entity-banner-${entity.tone}`}><div><span className="eyebrow">{isCommunity ? "Comunidade" : "Entidade acadêmica"} · {entity.category}</span><h1>{entity.name}</h1><p>{entity.description}</p><div className="space-header-actions"><span>{entity.members}</span><button className={`button ${following ? "button-secondary" : "button-primary"}`} aria-pressed={following} onClick={() => setFollowing((value) => !value)}>{following ? "Seguindo" : "Acompanhar"}</button></div></div><span className="entity-avatar entity-avatar-large">{entity.initials}</span></section>

    <nav className="space-tabs" aria-label={`Seções de ${entity.name}`} role="tablist">{spaceTabs.map((tab) => <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? "is-active" : ""} onClick={() => setActiveTab(tab)}>{tab}{tab === "Posts" && <span>{postList.length}</span>}</button>)}</nav>
    <div className="entity-page-grid">
      <main className="entity-posts-column">
        {activeTab === "Visão geral" && <>
          <section className="entity-post-section"><div className="catalog-results-heading"><div><h2>Em destaque</h2><p>Informações importantes deste espaço</p></div></div>
            {postList.filter((post) => post.pinned).map((post) => <PostCard key={post.id} post={post} pinned />)}
          </section>
          {relatedEvents.length > 0 && <section className="entity-post-section"><div className="catalog-results-heading"><div><h2>Próximos eventos</h2><p>Atividades organizadas por {entity.name}</p></div></div>{relatedEvents.slice(0, 2).map((event) => <article className="entity-post-card space-related-card" key={event.id}><span className="eyebrow">{event.type} · {event.date}</span><h3>{event.title}</h3><p>{event.description}</p><Link className="text-link" to={`/eventos/${event.id}`}>Ver evento <Icon name="arrowUpRight" width="15" height="15" /></Link></article>)}</section>}
          <section className="entity-post-section"><div className="catalog-results-heading"><div><h2>Posts recentes</h2><p>Publicações feitas por pessoas deste espaço</p></div><button className="text-link-button" onClick={() => setActiveTab("Posts")}>Ver todos</button></div>{postList.filter((post) => !post.pinned).slice(0, 2).map((post) => <PostCard key={post.id} post={post} />)}</section>
        </>}
        {activeTab === "Posts" && <section className="entity-post-section"><div className="catalog-results-heading"><div><h2>Posts</h2><p>Publicações em {entity.name}</p></div></div>{postList.map((post) => <PostCard key={post.id} post={post} pinned={post.pinned} />)}</section>}
        {activeTab === "Eventos" && <section className="entity-post-section"><div className="catalog-results-heading"><div><h2>Eventos</h2><p>Atividades ligadas a este espaço</p></div></div>{relatedEvents.length ? relatedEvents.map((event) => <article className="entity-post-card space-related-card" key={event.id}><span className="eyebrow">{event.type} · {event.date} · {event.time}</span><h3>{event.title}</h3><p>{event.description}</p><Link className="text-link" to={`/eventos/${event.id}`}>Ver evento <Icon name="arrowUpRight" width="15" height="15" /></Link></article>) : <div className="empty-state"><Icon name="calendar" /><strong>Ainda não há eventos</strong><span>Novas atividades aparecerão aqui.</span></div>}</section>}
        {activeTab === "Oportunidades" && <section className="entity-post-section"><div className="catalog-results-heading"><div><h2>Oportunidades</h2><p>Vagas e iniciativas divulgadas por este espaço</p></div></div>{relatedOpportunities.length ? relatedOpportunities.map((opportunity) => <article className="entity-post-card space-related-card" key={opportunity.id}><span className="eyebrow">{opportunity.type} · {opportunity.deadline}</span><h3>{opportunity.title}</h3><p>{opportunity.description}</p><p><strong>Elegibilidade:</strong> {opportunity.eligibility}</p><Link className="text-link" to="/oportunidades">Ver oportunidades <Icon name="arrowUpRight" width="15" height="15" /></Link></article>) : <div className="empty-state"><Icon name="bookmark" /><strong>Ainda não há oportunidades</strong><span>Novas oportunidades aparecerão aqui.</span></div>}</section>}
      </main>
      <aside className="entity-info-card"><div className="entity-info-title"><span className={`entity-avatar entity-avatar-${entity.tone}`}>{entity.initials}</span><div><strong>{entity.name}</strong><span className={`space-kind-badge ${isCommunity ? "is-community" : "is-entity"}`}>{isCommunity ? "Comunidade universitária" : entity.type}</span></div></div><p className="space-kind-explanation">{isCommunity ? "Grupo criado por pessoas da comunidade universitária." : "Estrutura acadêmica vinculada à universidade."}</p><dl><div><dt>Categoria</dt><dd>{entity.category}</dd></div><div><dt>Local</dt><dd>{entity.location}</dd></div><div><dt>Participantes</dt><dd>{entity.members}</dd></div><div><dt>Responsáveis</dt><dd>{entity.managers?.join(", ") ?? "Equipe do espaço"}</dd></div></dl><Link className="button button-secondary" to="/admin">Gerenciar perfil</Link>{following && <p className="inline-confirmation" role="status">Seguindo este espaço nesta demonstração.</p>}{relatedEvents.length === 0 && relatedOpportunities.length === 0 && <span className="space-route-note">Feed: {detailPath}</span>}</aside>
    </div>
  </div>;
}

function PostCard({ post, pinned = false }: { post: Entity["posts"][number]; pinned?: boolean }) {
  return <article className={`entity-post-card${pinned ? " entity-pinned-post" : ""}`}>
    {pinned && <span className="pinned-label"><Icon name="bookmark" width="14" height="14" /> Fixado</span>}
    <div className="space-post-author"><span className="avatar avatar-small">{(post.author ?? "Pessoa").slice(0, 1)}</span><span><strong>{post.author ?? "Pessoa da comunidade"}</strong><small>{post.authorRole ?? "Membro"} · {post.date}</small></span></div>
    <h3>{post.title}</h3><p>{post.body}</p>
    {post.eventId && <Link className="text-link" to={`/eventos/${post.eventId}`}>Ver atividade relacionada <Icon name="arrowUpRight" width="15" height="15" /></Link>}
    {post.comments !== undefined && <span className="post-comment-count"><Icon name="message" width="15" height="15" /> {post.comments} comentários</span>}
  </article>;
}
