import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import { communities, spacePath } from "../data/demoContent";

const categories = ["Todas", ...new Set(communities.map((space) => space.category))] as const;
type Category = (typeof categories)[number];

export function CommunitiesPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("Todas");
  const [following, setFollowing] = useState<string[]>(
    communities.filter((space) => space.followed).map((space) => space.id),
  );
  const [liked, setLiked] = useState<string[]>([]);
  const [feedMode, setFeedMode] = useState<"all" | "following">("all");
  const visiblePosts = useMemo(
    () =>
      communities
        .flatMap((space) => space.posts.filter((post) => !post.pinned).map((post) => ({ ...post, space })))
        .filter(({ body, author, space }) => {
          const matchesQuery = `${body} ${author ?? ""} ${space.name}`
            .toLocaleLowerCase("pt-BR")
            .includes(query.trim().toLocaleLowerCase("pt-BR"));
          const matchesCategory = category === "Todas" || space.category === category;
          const matchesFeed = feedMode === "all" || following.includes(space.id);
          return matchesQuery && matchesCategory && matchesFeed;
        }),
    [category, feedMode, following, query],
  );

  function toggle(id: string, setValues: (next: string[] | ((current: string[]) => string[])) => void) {
    setValues((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  }

  return (
    <div className="community-page">
      <div className="page-heading-row">
        <div className="page-intro product-page-intro">
          <p className="eyebrow">Encontre sua comunidade</p>
          <h1>Comunidades</h1>
          <p>Converse, compartilhe ideias e encontre pessoas com interesses em comum.</p>
        </div>
        <span className="preview-badge">
          <span aria-hidden="true" /> Prévia visual
        </span>
      </div>
      <div className="community-layout">
        <section className="community-feed" aria-label="Feed de comunidades">
          <div className="feed-tools">
            <label className="search-field">
              <Icon name="search" width="18" height="18" />
              <span className="sr-only">Buscar no feed</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar publicações ou comunidades"
              />
            </label>
            <div className="feed-tabs" role="group" aria-label="Tipo de feed">
              <button className={feedMode === "all" ? "is-active" : ""} onClick={() => setFeedMode("all")}>
                Todas
              </button>
              <button className={feedMode === "following" ? "is-active" : ""} onClick={() => setFeedMode("following")}>
                Seguindo
              </button>
            </div>
          </div>
          <div className="category-filters" aria-label="Filtrar por assunto">
            {categories.map((item) => (
              <button key={item} className={category === item ? "is-active" : ""} onClick={() => setCategory(item)}>
                {item}
              </button>
            ))}
          </div>
          <p className="demo-note">Cada publicação aparece em nome de uma pessoa e mostra sua relação com o espaço.</p>
          {visiblePosts.length > 0 ? (
            visiblePosts.map(({ id, body, author, authorRole, date, comments = 0, space }) => {
              const isLiked = liked.includes(id);
              return (
                <article className="post-card" key={id}>
                  <div className="post-community-line">
                    <Link to={spacePath(space)} className="community-avatar">
                      <Icon name="communities" width="18" height="18" />
                    </Link>
                    <div>
                      <strong>
                        <Link to={spacePath(space)}>{space.name}</Link>
                      </strong>
                      <span>{date}</span>
                    </div>
                    <Link
                      className={`space-kind-badge ${space.spaceKind === "community" ? "is-community" : "is-entity"}`}
                      to={spacePath(space)}
                    >
                      Comunidade
                    </Link>
                  </div>
                  <div className="post-author">
                    <span className="avatar avatar-small">{(author ?? "P").slice(0, 1)}</span>
                    <strong>{author ?? "Pessoa da comunidade"}</strong>
                    <span>·</span>
                    <span>{authorRole ?? "Membro"}</span>
                  </div>
                  <p className="post-body">{body}</p>
                  <div className="post-actions">
                    <button
                      className={isLiked ? "is-liked" : ""}
                      aria-pressed={isLiked}
                      onClick={() => toggle(id, setLiked)}
                    >
                      <Icon name="heart" width="17" height="17" /> {4 + (isLiked ? 1 : 0)}
                    </button>
                    <span className="post-comment-count">
                      <Icon name="message" width="17" height="17" /> {comments} comentários
                    </span>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="empty-state">
              <Icon name="search" />
              <strong>Nenhuma publicação encontrada</strong>
              <span>Tente mudar a busca, o assunto ou o feed selecionado.</span>
            </div>
          )}
        </section>

        <aside className="community-discovery" aria-label="Descobrir comunidades">
          <div className="discovery-heading">
            <div>
              <p className="eyebrow">Conheça mais</p>
              <h2>Descobrir comunidades</h2>
            </div>
            <span className="discovery-count">{communities.length}</span>
          </div>
          <p className="discovery-description">Encontre espaços para participar e acompanhar.</p>
          <div className="discovery-list">
            {communities.map((community) => {
              const isFollowing = following.includes(community.id);
              return (
                <article className="discovery-card" key={community.id}>
                  <Link
                    to={spacePath(community)}
                    className={`discovery-icon entity-avatar-${community.tone}`}
                    aria-label={`Abrir ${community.name}`}
                  >
                    <Icon name="communities" width="19" height="19" />
                  </Link>
                  <div className="discovery-card-copy">
                    <span className="community-category">{community.category}</span>
                    <h3>
                      <Link to={spacePath(community)}>{community.name}</Link>
                    </h3>
                    <p>{community.description}</p>
                    <small>{community.members}</small>
                    <Link className="text-link" to={spacePath(community)}>
                      Ver espaço <Icon name="arrowUpRight" width="13" height="13" />
                    </Link>
                  </div>
                  <button
                    className={`follow-button${isFollowing ? " is-following" : ""}`}
                    aria-pressed={isFollowing}
                    onClick={() => toggle(community.id, setFollowing)}
                  >
                    {isFollowing ? "Seguindo" : "Seguir"}
                  </button>
                </article>
              );
            })}
          </div>
          <div className="demo-callout">
            <Icon name="communities" width="18" height="18" />
            <p>
              Comunidades são grupos criados pela comunidade universitária; cada uma pode ter uma página, posts e
              eventos.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
