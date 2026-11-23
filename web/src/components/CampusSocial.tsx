import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { getSemesters } from "../services/campus";
import { campusProfilePath } from "../utils/profileRoutes";
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
  return campusProfilePath(type, id);
}

function displayDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase("pt-BR");
}

function errorText(error: unknown): string {
  if (error instanceof CampusSocialApiError && error.status === 401) return "Sua sessão expirou. Entre novamente.";
  if (error instanceof CampusSocialApiError && error.status === 403)
    return "Siga a comunidade para participar desta conversa.";
  if (error instanceof CampusSocialApiError && error.status === 409)
    return "Esta ação já foi realizada ou não está mais disponível.";
  return "Não foi possível concluir a ação. Tente novamente.";
}

type SocialPostKind = "POST" | "POLL";

function SocialDialog({
  id,
  open,
  title,
  description,
  onClose,
  children,
}: {
  id: string;
  open: boolean;
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      aria-labelledby={`${id}-title`}
      className="social-composer-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onClose={onClose}
      ref={dialogRef}
    >
      <header>
        <div>
          <p className="eyebrow">Campus</p>
          <h2 id={`${id}-title`}>{title}</h2>
          <p>{description}</p>
        </div>
        <button className="dialog-close" type="button" aria-label="Fechar" onClick={onClose}>
          ×
        </button>
      </header>
      {children}
    </dialog>
  );
}

function SocialPostKindPicker({
  value,
  onChange,
}: {
  value: SocialPostKind;
  onChange: (next: SocialPostKind) => void;
}) {
  return (
    <div className="social-post-kind-picker" role="group" aria-label="Tipo da publicação">
      <button
        type="button"
        aria-pressed={value === "POST"}
        className={value === "POST" ? "is-selected" : ""}
        onClick={() => onChange("POST")}
      >
        <strong>Publicação</strong>
        <span>Compartilhe um aviso ou novidade.</span>
      </button>
      <button
        type="button"
        aria-pressed={value === "POLL"}
        className={value === "POLL" ? "is-selected" : ""}
        onClick={() => onChange("POLL")}
      >
        <strong>Enquete</strong>
        <span>Faça uma pergunta para a comunidade.</span>
      </button>
    </div>
  );
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
  const isCommunityPost = post.postType === "COMMUNITY_SPACE";
  return (
    <article className="campus-post-card">
      <header className="social-post-header">
        <span className="social-post-avatar" aria-hidden="true">
          {initials(isCommunityPost ? post.authorName : source.name)}
        </span>
        {isCommunityPost ? (
          <div>
            <strong className="social-post-author">{post.authorName}</strong>
            <small className="social-post-community-context">
              Na comunidade <Link to={profilePath(sourceType, sourceId)}>{source.name}</Link> ·{" "}
              {displayDate(post.createdAt)}
            </small>
          </div>
        ) : (
          <div>
            <Link to={profilePath(sourceType, sourceId)}>{source.name}</Link>
            <small>
              {post.authorName} · {displayDate(post.createdAt)}
            </small>
          </div>
        )}
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
    </article>
  );
}

export function FollowedFeed({ token }: { token: string }) {
  const [result, setResult] = useState<CampusPage<FeedPost | CommunitySpacePost> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setResult(await getCampusFeed(token));
    } catch {
      setError("Não foi possível carregar o mural de quem você segue.");
    } finally {
      setLoading(false);
    }
  }, [token]);

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
          <p className="eyebrow">Seu feed</p>
          <h2 id="followed-feed-title">Publicações e conversas</h2>
          <p>Publicações institucionais e posts das comunidades que você segue, em ordem cronológica.</p>
        </div>
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
          {[...result.items]
            .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
            .map((post) => (
              <PostCard key={post.id} post={post} token={token} onPollUpdate={(poll) => updatePoll(post.id, poll)} />
            ))}
        </div>
      ) : (
        <div className="empty-state">
          <strong>Nada novo por enquanto</strong>
          <span>Publicações institucionais e novas conversas das comunidades que você segue aparecerão aqui.</span>
          <Link className="text-link" to="/perfis?tipo=comunidades">
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
  profileName = "UNIR",
  currentTerm,
  canManage,
}: {
  token: string;
  type: InstitutionalProfileType;
  profileId: string;
  profileName?: string;
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
  const [composerOpen, setComposerOpen] = useState(false);
  const [postKind, setPostKind] = useState<SocialPostKind>("POST");

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
    if (postKind === "POLL" && (!pollQuestion.trim() || options.length < 2)) {
      setError("Inclua pelo menos duas opções para publicar uma enquete.");
      return;
    }
    if (postKind === "POST" && !body.trim()) return;
    setPublishing(true);
    setError("");
    try {
      await createInstitutionalPost(token, type, profileId, {
        body: body.trim(),
        term,
        ...(availableUntil ? { availableUntil: new Date(availableUntil).toISOString() } : {}),
        ...(postKind === "POLL" ? { poll: { question: pollQuestion.trim(), options } } : {}),
      });
      setBody("");
      setPollQuestion("");
      setPollOptions("");
      setAvailableUntil("");
      setPostKind("POST");
      setComposerOpen(false);
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
        <div className="campus-term-filter">
          <label className="campus-term-field" htmlFor={`profile-term-${profileId}`}>
            <span>Semestre</span>
            <select
              id={`profile-term-${profileId}`}
              value={draftTerm}
              onChange={(event) => {
                setDraftTerm(event.target.value);
                setTerm(event.target.value.trim());
              }}
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
          </label>
        </div>
      </header>
      <label className="campus-history-toggle">
        <input type="checkbox" checked={includeExpired} onChange={(event) => setIncludeExpired(event.target.checked)} />
        Incluir publicações com prazo encerrado
      </label>
      {canManage && (
        <>
          <button
            className="social-composer-trigger"
            type="button"
            onClick={() => {
              setError("");
              setComposerOpen(true);
            }}
          >
            <span className="social-compose-avatar" aria-hidden="true">
              {initials(profileName)}
            </span>
            <span>Compartilhe uma novidade com {profileName}</span>
            <span className="social-compose-action">Criar publicação</span>
          </button>
          <SocialDialog
            id={`institutional-composer-${profileId}`}
            open={composerOpen}
            title="Criar publicação"
            description={`Publique um aviso ou uma enquete como ${profileName}.`}
            onClose={() => setComposerOpen(false)}
          >
            <form className="social-composer-form" onSubmit={(event) => void publish(event)}>
              <SocialPostKindPicker
                value={postKind}
                onChange={(next) => {
                  setPostKind(next);
                  setError("");
                }}
              />
              {postKind === "POST" ? (
                <label className="field">
                  <span>Texto da publicação</span>
                  <textarea
                    required
                    rows={5}
                    maxLength={10000}
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    placeholder="Escreva um aviso ou informação"
                  />
                </label>
              ) : (
                <>
                  <label className="field">
                    <span>Contexto (opcional)</span>
                    <textarea
                      rows={3}
                      maxLength={10000}
                      value={body}
                      onChange={(event) => setBody(event.target.value)}
                      placeholder="Explique o assunto da enquete"
                    />
                  </label>
                  <label className="field">
                    <span>Pergunta</span>
                    <input
                      required
                      maxLength={500}
                      value={pollQuestion}
                      onChange={(event) => setPollQuestion(event.target.value)}
                      placeholder="O que você quer perguntar?"
                    />
                  </label>
                  <label className="field">
                    <span>Opções, uma por linha</span>
                    <textarea
                      required
                      rows={3}
                      value={pollOptions}
                      onChange={(event) => setPollOptions(event.target.value)}
                      placeholder={"Primeira opção\nSegunda opção"}
                    />
                  </label>
                </>
              )}
              <label className="field">
                <span>Disponível até (opcional)</span>
                <input
                  type="datetime-local"
                  value={availableUntil}
                  onChange={(event) => setAvailableUntil(event.target.value)}
                />
              </label>
              {error && (
                <p className="notice notice-error" role="alert">
                  {error}
                </p>
              )}
              <div className="social-composer-actions">
                <button className="button button-secondary" type="button" onClick={() => setComposerOpen(false)}>
                  Cancelar
                </button>
                <button
                  className="button button-primary"
                  disabled={publishing || (postKind === "POST" && !body.trim())}
                  type="submit"
                >
                  {publishing ? "Publicando…" : "Publicar"}
                </button>
              </div>
            </form>
          </SocialDialog>
        </>
      )}
      {error && !composerOpen && (
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
  viewerName,
  onChanged,
}: {
  token: string;
  post: CommunitySpacePost;
  viewerName: string;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<CampusComment[]>([]);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<CampusComment | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);

  async function loadComments() {
    setCommentsLoading(true);
    try {
      setComments((await getCommunityComments(token, post.id)).items);
      setError("");
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setCommentsLoading(false);
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
        aria-expanded={open}
        className="social-comment-toggle"
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          if (!open) void loadComments();
        }}
      >
        <span>{open ? "Ocultar comentários" : "Comentar"}</span>
        <span className="social-comment-count">{post.commentsCount}</span>
      </button>
      {open && (
        <div className="campus-comment-panel">
          {commentsLoading ? (
            <p className="social-comment-loading" role="status">
              Carregando comentários…
            </p>
          ) : null}
          <div className="campus-comment-list">
            {comments.map((comment) => (
              <article
                className={comment.parentCommentId ? "campus-comment is-reply" : "campus-comment"}
                key={comment.id}
              >
                <span className="social-comment-avatar" aria-hidden="true">
                  {initials(comment.authorName || "U")}
                </span>
                <div className="campus-comment-content">
                  <strong>{comment.authorName}</strong>
                  <p>{comment.body}</p>
                  <button className="social-comment-reply" type="button" onClick={() => setReplyTo(comment)}>
                    Responder
                  </button>
                </div>
              </article>
            ))}
            {!commentsLoading && comments.length === 0 && !error && (
              <p className="social-comment-loading">Seja a primeira pessoa a comentar.</p>
            )}
          </div>
          <form className="campus-comment-composer" onSubmit={(event) => void submit(event)}>
            {replyTo && (
              <div className="social-reply-context">
                Respondendo a <strong>{replyTo.authorName}</strong>
                <button className="social-comment-reply" type="button" onClick={() => setReplyTo(null)}>
                  Cancelar
                </button>
              </div>
            )}
            <div className="social-comment-input-row">
              <span className="social-comment-avatar" aria-hidden="true">
                {initials(viewerName)}
              </span>
              <textarea
                rows={2}
                maxLength={5000}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder={replyTo ? `Responder a ${replyTo.authorName}` : "Escreva um comentário"}
              />
              <button className="button button-primary" disabled={busy || !body.trim()} type="submit">
                {busy ? "Enviando…" : "Enviar"}
              </button>
            </div>
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
  communityName = "comunidade",
  viewerName = "Você",
  following,
}: {
  token: string;
  communityId: string;
  communityName?: string;
  viewerName?: string;
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
  const [composerOpen, setComposerOpen] = useState(false);
  const [postKind, setPostKind] = useState<SocialPostKind>("POST");

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
  }, [communityId, token]);
  useEffect(() => {
    if (reload >= 0) void load();
  }, [load, reload]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const options = pollOptions
      .split("\n")
      .map((option) => option.trim())
      .filter(Boolean);
    if (postKind === "POLL" && (!pollQuestion.trim() || options.length < 2)) {
      setError("Inclua pelo menos duas opções para publicar uma enquete.");
      return;
    }
    if (postKind === "POST" && !body.trim()) return;
    setBusy(true);
    setError("");
    try {
      await createCommunityPost(token, communityId, {
        body: body.trim(),
        ...(availableUntil ? { availableUntil: new Date(availableUntil).toISOString() } : {}),
        ...(postKind === "POLL" ? { poll: { question: pollQuestion.trim(), options } } : {}),
      });
      setBody("");
      setAvailableUntil("");
      setPollQuestion("");
      setPollOptions("");
      setPostKind("POST");
      setComposerOpen(false);
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
        <>
          <button
            className="social-composer-trigger"
            type="button"
            onClick={() => {
              setError("");
              setComposerOpen(true);
            }}
          >
            <span className="social-compose-avatar" aria-hidden="true">
              {initials(viewerName)}
            </span>
            <span>Compartilhe algo com a comunidade</span>
            <span className="social-compose-action">Criar publicação</span>
          </button>
          <SocialDialog
            id={`community-composer-${communityId}`}
            open={composerOpen}
            title="Criar publicação"
            description={`Compartilhe uma novidade ou faça uma pergunta para as pessoas de ${communityName}.`}
            onClose={() => setComposerOpen(false)}
          >
            <form className="social-composer-form" onSubmit={(event) => void submit(event)}>
              <SocialPostKindPicker
                value={postKind}
                onChange={(next) => {
                  setPostKind(next);
                  setError("");
                }}
              />
              {postKind === "POST" ? (
                <label className="field">
                  <span>Texto da publicação</span>
                  <textarea
                    required
                    rows={5}
                    maxLength={10000}
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    placeholder="O que você quer compartilhar?"
                  />
                </label>
              ) : (
                <>
                  <label className="field">
                    <span>Contexto (opcional)</span>
                    <textarea
                      rows={3}
                      maxLength={10000}
                      value={body}
                      onChange={(event) => setBody(event.target.value)}
                      placeholder="Explique o assunto da enquete"
                    />
                  </label>
                  <label className="field">
                    <span>Pergunta</span>
                    <input
                      required
                      maxLength={500}
                      value={pollQuestion}
                      onChange={(event) => setPollQuestion(event.target.value)}
                      placeholder="O que você quer perguntar?"
                    />
                  </label>
                  <label className="field">
                    <span>Opções, uma por linha</span>
                    <textarea
                      required
                      rows={3}
                      value={pollOptions}
                      onChange={(event) => setPollOptions(event.target.value)}
                      placeholder={"Primeira opção\nSegunda opção"}
                    />
                  </label>
                </>
              )}
              <label className="field">
                <span>Disponível até (opcional)</span>
                <input
                  type="datetime-local"
                  value={availableUntil}
                  onChange={(event) => setAvailableUntil(event.target.value)}
                />
              </label>
              {error && (
                <p className="notice notice-error" role="alert">
                  {error}
                </p>
              )}
              <div className="social-composer-actions">
                <button className="button button-secondary" type="button" onClick={() => setComposerOpen(false)}>
                  Cancelar
                </button>
                <button
                  className="button button-primary"
                  disabled={busy || (postKind === "POST" && !body.trim())}
                  type="submit"
                >
                  {busy ? "Publicando…" : "Publicar"}
                </button>
              </div>
            </form>
          </SocialDialog>
        </>
      ) : (
        <p className="notice">Siga esta comunidade para publicar, comentar e responder.</p>
      )}
      {error && !composerOpen && (
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
                <CommunityPostThread
                  token={token}
                  post={post}
                  viewerName={viewerName}
                  onChanged={() => setReload((value) => value + 1)}
                />
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
