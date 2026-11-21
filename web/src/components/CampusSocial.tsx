import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { getSemesters } from "../services/campus";
import {
  CampusSocialApiError,
  createCommunityComment,
  createCommunityPost,
  createInstitutionalPost,
  getCampusFeed,
  getCommunityComments,
  getCommunityPosts,
  getFollowedProfiles,
  getInstitutionalPosts,
  type CampusComment,
  type CampusFollow,
  type CampusPage,
  type CampusPoll,
  type CommunitySpacePost,
  type FeedPost,
  type InstitutionalProfileType,
  voteOnPoll,
} from "../services/campusSocial";

function profilePath(type: InstitutionalProfileType, id: string): string {
  if (type === "UNIVERSITY") return "/universidade";
  if (type === "ACADEMIC_UNIT") return `/unidades/${encodeURIComponent(id)}`;
  if (type === "DEPARTMENT") return `/departamentos/${encodeURIComponent(id)}`;
  if (type === "ACADEMIC_ENTITY") return `/entidades/${encodeURIComponent(id)}`;
  return `/comunidades/${encodeURIComponent(id)}`;
}

function displayDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function errorText(error: unknown): string {
  if (error instanceof CampusSocialApiError && error.status === 401) return "Sua sessão expirou. Entre novamente.";
  if (error instanceof CampusSocialApiError && error.status === 403)
    return "Siga a comunidade para participar desta conversa.";
  if (error instanceof CampusSocialApiError && error.status === 409)
    return "Esta ação já foi realizada ou não está mais disponível.";
  return "Não foi possível concluir a ação. Tente novamente.";
}

function useSemesterNames(token: string, currentTerm: string): string[] {
  const [names, setNames] = useState<string[]>(currentTerm ? [currentTerm] : []);

  useEffect(() => {
    let active = true;
    getSemesters(token)
      .then(({ items }) => {
        const catalog = items.map((semester) => semester.name);
        if (currentTerm && !catalog.includes(currentTerm)) catalog.push(currentTerm);
        if (active) setNames(catalog);
      })
      .catch(() => {
        if (active) setNames(currentTerm ? [currentTerm] : []);
      });
    return () => {
      active = false;
    };
  }, [currentTerm, token]);

  return names;
}

export function FollowControl({
  token,
  type,
  profileId,
  onChange,
}: {
  token: string;
  type: InstitutionalProfileType;
  profileId: string;
  onChange?: (following: boolean) => void;
}) {
  const [follow, setFollow] = useState<CampusFollow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const { items } = await getFollowedProfiles(token);
      const current = items.find((item) => item.targetType === type && item.targetId === profileId) ?? null;
      setFollow(current);
      onChange?.(Boolean(current));
    } catch {
      setError("Não foi possível consultar quem você segue.");
    }
  }, [onChange, profileId, token, type]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function toggle() {
    setBusy(true);
    setError("");
    try {
      if (follow) {
        const { unfollowProfile } = await import("../services/campusSocial");
        await unfollowProfile(token, follow.id);
        setFollow(null);
        onChange?.(false);
      } else {
        const { followProfile } = await import("../services/campusSocial");
        setFollow(await followProfile(token, type, profileId));
        onChange?.(true);
      }
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="campus-follow-control">
      <button
        className={follow ? "button button-secondary" : "button button-primary"}
        disabled={busy}
        onClick={() => void toggle()}
      >
        {busy ? "Atualizando…" : follow ? "Seguindo" : "Seguir perfil"}
      </button>
      {error && <small role="status">{error}</small>}
    </div>
  );
}

function PollView({
  poll,
  token,
  onUpdate,
}: {
  poll: CampusPoll;
  token: string;
  onUpdate: (poll: CampusPoll) => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const totalVotes = poll.options.reduce((total, option) => total + option.votes, 0);

  async function vote(optionId: string) {
    setBusy(true);
    setError("");
    try {
      onUpdate(await voteOnPoll(token, poll.id, optionId));
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="campus-poll" aria-label="Enquete">
      <strong>{poll.question}</strong>
      <div className="campus-poll-options">
        {poll.options.map((option) => {
          const selected = poll.myVoteOptionId === option.id;
          return (
            <button
              key={option.id}
              className={selected ? "is-selected" : ""}
              disabled={busy || poll.closed || Boolean(poll.myVoteOptionId)}
              onClick={() => void vote(option.id)}
            >
              <span>{option.text}</span>
              {(poll.myVoteOptionId || poll.closed) && <small>{option.votes} votos</small>}
            </button>
          );
        })}
      </div>
      <small>
        {totalVotes} votos{poll.closed ? " · Enquete encerrada" : ""}
      </small>
      {error && <small role="alert">{error}</small>}
    </section>
  );
}

function PostCard({
  post,
  token,
  onPollUpdate,
}: {
  post: FeedPost | CommunitySpacePost;
  token: string;
  onPollUpdate: (poll: CampusPoll) => void;
}) {
  const source = post.postType === "OFFICIAL" ? post.owner : post.community;
  const sourceType = post.postType === "OFFICIAL" ? post.owner.type : "COMMUNITY";
  const sourceId = post.postType === "OFFICIAL" ? post.owner.id : post.community.id;
  return (
    <article className="campus-post-card">
      <header>
        <div>
          <Link to={profilePath(sourceType, sourceId)}>{source.name}</Link>
          <small>
            {post.authorName} · {displayDate(post.createdAt)}
          </small>
        </div>
        {post.postType === "OFFICIAL" && <span>{post.term}</span>}
      </header>
      {post.body && <p className="campus-post-body">{post.body}</p>}
      {post.poll && <PollView poll={post.poll} token={token} onUpdate={onPollUpdate} />}
      {post.externalUrl && (
        <a href={post.externalUrl} target="_blank" rel="noreferrer">
          Abrir link externo ↗
        </a>
      )}
      {post.availableUntil && (
        <small className="campus-post-expiry">Disponível até {displayDate(post.availableUntil)}</small>
      )}
      {post.postType === "COMMUNITY_SPACE" && <small>{post.commentsCount} comentários</small>}
    </article>
  );
}

export function FollowedFeed({ token, currentTerm }: { token: string; currentTerm: string }) {
  const semesterNames = useSemesterNames(token, currentTerm);
  const [term, setTerm] = useState(currentTerm);
  const [draftTerm, setDraftTerm] = useState(currentTerm);
  const [result, setResult] = useState<CampusPage<FeedPost> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (term || semesterNames.length === 0) return;
    setTerm(semesterNames[0]);
    setDraftTerm(semesterNames[0]);
  }, [semesterNames, term]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setResult(await getCampusFeed(token, term));
    } catch {
      setError("Não foi possível carregar o mural de quem você segue.");
    } finally {
      setLoading(false);
    }
  }, [term, token]);

  useEffect(() => void load(), [load]);

  function updatePoll(postId: string, poll: CampusPoll) {
    setResult(
      (current) =>
        current && {
          ...current,
          items: current.items.map((post) => (post.id === postId ? { ...post, poll } : post)),
        },
    );
  }

  return (
    <section className="campus-social-panel" aria-labelledby="followed-feed-title">
      <header className="campus-social-heading">
        <div>
          <p className="eyebrow">Mural da sua rede</p>
          <h2 id="followed-feed-title">Publicações</h2>
          <p>Informações publicadas pelos perfis que você segue.</p>
        </div>
        <form
          className="campus-term-filter"
          onSubmit={(event) => {
            event.preventDefault();
            setTerm(draftTerm.trim());
          }}
        >
          <label htmlFor="feed-term">Semestre</label>
          <select id="feed-term" value={draftTerm} onChange={(event) => setDraftTerm(event.target.value)}>
            {semesterNames.length ? (
              semesterNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))
            ) : (
              <option value="">Semestre indisponível</option>
            )}
          </select>
          <button className="button button-secondary" type="submit">
            Filtrar
          </button>
        </form>
      </header>
      {loading ? (
        <p className="notice" role="status">
          Carregando publicações…
        </p>
      ) : error ? (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      ) : result?.items.length ? (
        <div className="campus-social-list">
          {result.items.map((post) => (
            <PostCard key={post.id} post={post} token={token} onPollUpdate={(poll) => updatePoll(post.id, poll)} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <strong>Nenhuma publicação neste semestre</strong>
          <span>Siga a universidade, departamentos, unidades, entidades e comunidades para montar seu mural.</span>
          <Link className="text-link" to="/comunidades">
            Explorar perfis institucionais
          </Link>
        </div>
      )}
    </section>
  );
}

export function InstitutionalPostsPanel({
  token,
  type,
  profileId,
  currentTerm,
  canManage,
}: {
  token: string;
  type: InstitutionalProfileType;
  profileId: string;
  currentTerm: string;
  canManage: boolean;
}) {
  const semesterNames = useSemesterNames(token, currentTerm);
  const [term, setTerm] = useState(currentTerm);
  const [draftTerm, setDraftTerm] = useState(currentTerm);
  const [includeExpired, setIncludeExpired] = useState(false);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [body, setBody] = useState("");
  const [availableUntil, setAvailableUntil] = useState("");
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState("");
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    if (term || semesterNames.length === 0) return;
    setTerm(semesterNames[0]);
    setDraftTerm(semesterNames[0]);
  }, [semesterNames, term]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setPosts((await getInstitutionalPosts(token, type, profileId, term, 0, 20, includeExpired)).items);
    } catch {
      setError("Não foi possível carregar as publicações deste perfil.");
    } finally {
      setLoading(false);
    }
  }, [includeExpired, profileId, term, token, type]);

  useEffect(() => void load(), [load]);

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const options = pollOptions
      .split("\n")
      .map((option) => option.trim())
      .filter(Boolean);
    if (pollQuestion.trim() && options.length < 2) {
      setError("Inclua pelo menos duas opções para publicar uma enquete.");
      return;
    }
    setPublishing(true);
    setError("");
    try {
      await createInstitutionalPost(token, type, profileId, {
        body,
        term,
        ...(availableUntil ? { availableUntil: new Date(availableUntil).toISOString() } : {}),
        ...(pollQuestion.trim() ? { poll: { question: pollQuestion.trim(), options } } : {}),
      });
      setBody("");
      setPollQuestion("");
      setPollOptions("");
      setAvailableUntil("");
      await load();
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setPublishing(false);
    }
  }

  function updatePoll(postId: string, poll: CampusPoll) {
    setPosts((current) => current.map((post) => (post.id === postId ? { ...post, poll } : post)));
  }

  return (
    <section className="campus-social-panel" aria-labelledby="profile-posts-title">
      <header className="campus-social-heading">
        <div>
          <p className="eyebrow">Mural institucional</p>
          <h2 id="profile-posts-title">Publicações</h2>
          <p>Os avisos ficam no histórico do semestre, mesmo após o prazo de exibição.</p>
        </div>
        <form
          className="campus-term-filter"
          onSubmit={(event) => {
            event.preventDefault();
            setTerm(draftTerm.trim());
          }}
        >
          <label htmlFor={`profile-term-${profileId}`}>Semestre</label>
          <select
            id={`profile-term-${profileId}`}
            value={draftTerm}
            onChange={(event) => setDraftTerm(event.target.value)}
          >
            {semesterNames.length ? (
              semesterNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))
            ) : (
              <option value="">Semestre indisponível</option>
            )}
          </select>
          <button className="button button-secondary" type="submit">
            Filtrar
          </button>
        </form>
      </header>
      <label className="campus-history-toggle">
        <input type="checkbox" checked={includeExpired} onChange={(event) => setIncludeExpired(event.target.checked)} />
        Incluir publicações com prazo encerrado
      </label>
      {canManage && (
        <form className="campus-post-composer" onSubmit={(event) => void publish(event)}>
          <label className="field">
            <span>Nova publicação oficial</span>
            <textarea
              rows={3}
              maxLength={10000}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Escreva um aviso ou informação"
            />
          </label>
          <label className="field">
            <span>Enquete (opcional)</span>
            <input
              value={pollQuestion}
              maxLength={500}
              onChange={(event) => setPollQuestion(event.target.value)}
              placeholder="Pergunta da enquete"
            />
          </label>
          {pollQuestion && (
            <label className="field">
              <span>Opções, uma por linha</span>
              <textarea rows={3} value={pollOptions} onChange={(event) => setPollOptions(event.target.value)} />
            </label>
          )}
          <label className="field">
            <span>Disponível até (opcional)</span>
            <input
              type="datetime-local"
              value={availableUntil}
              onChange={(event) => setAvailableUntil(event.target.value)}
            />
          </label>
          <button
            className="button button-primary"
            disabled={publishing || (!body.trim() && !pollQuestion.trim())}
            type="submit"
          >
            {publishing ? "Publicando…" : "Publicar"}
          </button>
        </form>
      )}
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className="notice" role="status">
          Carregando publicações…
        </p>
      ) : posts.length ? (
        <div className="campus-social-list">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} token={token} onPollUpdate={(poll) => updatePoll(post.id, poll)} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <strong>Nenhuma publicação neste semestre</strong>
        </div>
      )}
    </section>
  );
}

function CommunityPostThread({
  token,
  post,
  onChanged,
}: {
  token: string;
  post: CommunitySpacePost;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<CampusComment[]>([]);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<CampusComment | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadComments() {
    try {
      setComments((await getCommunityComments(token, post.id)).items);
      setError("");
    } catch (requestError) {
      setError(errorText(requestError));
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError("");
    try {
      await createCommunityComment(token, post.id, body.trim(), replyTo?.id);
      setBody("");
      setReplyTo(null);
      await loadComments();
      onChanged();
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="campus-comment-thread">
      <button
        className="text-link"
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          if (!open) void loadComments();
        }}
      >
        {open ? "Fechar comentários" : `Abrir comentários (${post.commentsCount})`}
      </button>
      {open && (
        <div className="campus-comment-list">
          {comments.map((comment) => (
            <article
              className={comment.parentCommentId ? "campus-comment is-reply" : "campus-comment"}
              key={comment.id}
            >
              <strong>{comment.authorName}</strong>
              <p>{comment.body}</p>
              <button className="text-link" type="button" onClick={() => setReplyTo(comment)}>
                Responder
              </button>
            </article>
          ))}
          <form className="campus-comment-composer" onSubmit={(event) => void submit(event)}>
            {replyTo && (
              <small>
                Respondendo a {replyTo.authorName}{" "}
                <button type="button" onClick={() => setReplyTo(null)}>
                  Cancelar
                </button>
              </small>
            )}
            <textarea
              rows={2}
              maxLength={5000}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Escreva um comentário"
            />
            <button className="button button-secondary" disabled={busy || !body.trim()} type="submit">
              {busy ? "Enviando…" : "Comentar"}
            </button>
          </form>
          {error && (
            <p className="notice notice-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function CommunitySpacePanel({
  token,
  communityId,
  following,
}: {
  token: string;
  communityId: string;
  following: boolean;
}) {
  const [posts, setPosts] = useState<CommunitySpacePost[]>([]);
  const [body, setBody] = useState("");
  const [availableUntil, setAvailableUntil] = useState("");
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPosts((await getCommunityPosts(token, communityId)).items);
      setError("");
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setLoading(false);
    }
  }, [communityId, reload, token]);
  useEffect(() => void load(), [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const options = pollOptions
      .split("\n")
      .map((option) => option.trim())
      .filter(Boolean);
    if (pollQuestion.trim() && options.length < 2) {
      setError("Inclua pelo menos duas opções para publicar uma enquete.");
      return;
    }
    if (!body.trim() && !pollQuestion.trim()) return;
    setBusy(true);
    setError("");
    try {
      await createCommunityPost(token, communityId, {
        body: body.trim(),
        ...(availableUntil ? { availableUntil: new Date(availableUntil).toISOString() } : {}),
        ...(pollQuestion.trim() ? { poll: { question: pollQuestion.trim(), options } } : {}),
      });
      setBody("");
      setAvailableUntil("");
      setPollQuestion("");
      setPollOptions("");
      setReload((value) => value + 1);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setBusy(false);
    }
  }

  function updatePoll(postId: string, poll: CampusPoll) {
    setPosts((current) => current.map((post) => (post.id === postId ? { ...post, poll } : post)));
  }

  return (
    <section className="campus-social-panel" aria-labelledby="community-space-title">
      <header className="campus-social-heading">
        <div>
          <p className="eyebrow">Espaço aberto aos seguidores</p>
          <h2 id="community-space-title">Central da comunidade</h2>
          <p>Converse, publique avisos e responda às outras pessoas.</p>
        </div>
      </header>
      {following ? (
        <form className="campus-post-composer" onSubmit={(event) => void submit(event)}>
          <label className="field">
            <span>Nova publicação</span>
            <textarea
              rows={3}
              maxLength={10000}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Compartilhe algo com a comunidade"
            />
          </label>
          <label className="field">
            <span>Enquete (opcional)</span>
            <input
              value={pollQuestion}
              maxLength={500}
              onChange={(event) => setPollQuestion(event.target.value)}
              placeholder="Pergunta da enquete"
            />
          </label>
          {pollQuestion && (
            <label className="field">
              <span>Opções, uma por linha</span>
              <textarea rows={3} value={pollOptions} onChange={(event) => setPollOptions(event.target.value)} />
            </label>
          )}
          <label className="field">
            <span>Disponível até (opcional)</span>
            <input
              type="datetime-local"
              value={availableUntil}
              onChange={(event) => setAvailableUntil(event.target.value)}
            />
          </label>
          <button
            className="button button-primary"
            disabled={busy || (!body.trim() && !pollQuestion.trim())}
            type="submit"
          >
            {busy ? "Publicando…" : "Publicar"}
          </button>
        </form>
      ) : (
        <p className="notice">Siga esta comunidade para publicar, comentar e responder.</p>
      )}
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className="notice" role="status">
          Carregando a central da comunidade…
        </p>
      ) : posts.length ? (
        <div className="campus-social-list">
          {posts.map((post) => (
            <div className="campus-community-post" key={post.id}>
              <PostCard post={post} token={token} onPollUpdate={(poll) => updatePoll(post.id, poll)} />
              {following && (
                <CommunityPostThread token={token} post={post} onChanged={() => setReload((value) => value + 1)} />
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <strong>A central está pronta para começar</strong>
        </div>
      )}
    </section>
  );
}
