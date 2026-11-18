import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useOutletContext } from "react-router-dom";
import type Keycloak from "keycloak-js";
import { Icon } from "../components/Icon";
import {
  createMyProfile,
  getMyProfile,
  updateMyProfile,
  UserProfileApiError,
  type AcademicLevel,
  type AffiliationStatus,
  type UserProfile,
} from "../services/userProfile";

interface ProfileForm {
  name: string;
  institutionalId: string;
  affiliationStatus: AffiliationStatus | "";
  academicLevel: AcademicLevel | "";
  course: string;
  department: string;
  interests: string;
}

interface AccountContext {
  keycloak: Keycloak;
}

const emptyForm: ProfileForm = {
  name: "",
  institutionalId: "",
  affiliationStatus: "",
  academicLevel: "",
  course: "",
  department: "",
  interests: "",
};

function formFromProfile(profile: UserProfile): ProfileForm {
  return {
    name: profile.name,
    institutionalId: profile.institutionalId,
    affiliationStatus: profile.affiliationStatus ?? "",
    academicLevel: profile.academicLevel ?? "",
    course: profile.course,
    department: profile.department,
    interests: profile.interests.join("\n"),
  };
}

function interestsFromForm(value: string): string[] {
  return value
    .split("\n")
    .map((interest) => interest.trim())
    .filter(Boolean);
}

function errorMessage(error: unknown): string {
  if (error instanceof UserProfileApiError && error.status === 401) {
    return "Sua sessão expirou. Entre novamente para continuar.";
  }
  return "Não foi possível carregar ou salvar seu perfil. Verifique o serviço Campus e tente novamente.";
}

export function ProfilePage() {
  const { keycloak } = useOutletContext<AccountContext>();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [form, setForm] = useState<ProfileForm>(emptyForm);
  const [savedForm, setSavedForm] = useState<ProfileForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      try {
        await keycloak.updateToken(30);
        if (!keycloak.token) throw new Error("Token de acesso indisponível.");
        const currentProfile = await getMyProfile(keycloak.token);
        if (active) {
          const nextForm = currentProfile ? formFromProfile(currentProfile) : emptyForm;
          setProfile(currentProfile);
          setForm(nextForm);
          setSavedForm(nextForm);
        }
      } catch (loadError) {
        if (active) {
          setError(errorMessage(loadError));
          setLoadFailed(true);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadProfile();
    return () => {
      active = false;
    };
  }, [keycloak]);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(savedForm), [form, savedForm]);
  const displayName = profile?.name || String(keycloak.tokenParsed?.name ?? "");
  const avatarInitial = displayName.trim().charAt(0).toLocaleUpperCase("pt-BR") || "U";
  const accountEmail = String(keycloak.tokenParsed?.email ?? profile?.email ?? "");
  const emailVerified = Boolean(keycloak.tokenParsed?.email_verified);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty) return;
    setSaving(true);
    setError("");
    setSaved(false);

    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token de acesso indisponível.");

      const affiliationStatus = form.affiliationStatus;
      const academicLevel = form.academicLevel;
      if (!affiliationStatus || !academicLevel) return;
      const interests = interestsFromForm(form.interests);
      const updatedProfile = profile
        ? await updateMyProfile(keycloak.token, {
            name: form.name,
            affiliationStatus,
            academicLevel,
            course: form.course,
            department: form.department,
            interests,
          })
        : await createMyProfile(keycloak.token, {
            name: form.name,
            institutionalId: form.institutionalId,
            affiliationStatus,
            academicLevel,
            course: form.course,
            department: form.department,
            interests,
          });

      const nextForm = formFromProfile(updatedProfile);
      setProfile(updatedProfile);
      setForm(nextForm);
      setSavedForm(nextForm);
      setSaved(true);
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="profile-page">
      {loading ? (
        <p className="notice" role="status">
          Carregando seu perfil…
        </p>
      ) : loadFailed ? (
        <>
          <p className="notice notice-error" role="alert">
            {error}
          </p>
          <button className="button button-secondary retry-button" onClick={() => window.location.reload()}>
            Tentar novamente
          </button>
        </>
      ) : (
        <>
          <section className="profile-hero-card" aria-label="Resumo do perfil">
            <div className="profile-hero-banner">
              <span className="profile-campus-badge">UFRJ · CAMPUS CENTRAL</span>
            </div>
            <div className="profile-hero-content">
              <span className="avatar avatar-large profile-avatar" aria-hidden="true">
                {avatarInitial}
              </span>
              <div className="profile-hero-copy">
                <p className="eyebrow">Perfil acadêmico</p>
                <h2>{displayName || "Complete seu perfil"}</h2>
                <p>
                  {profile
                    ? [profile.course, profile.department].filter(Boolean).join(" · ")
                    : "Cadastre seus dados para completar seu perfil na comunidade acadêmica."}
                </p>
              </div>
              <span className={`profile-state ${profile ? "is-complete" : ""}`}>
                {profile ? "Perfil cadastrado" : "Perfil incompleto"}
              </span>
              <div className="profile-hero-facts">
                <span>
                  <strong>E-mail da conta</strong>
                  {accountEmail || "Não informado"}
                </span>
                {profile && (
                  <span>
                    <strong>Matrícula</strong>
                    {profile.institutionalId}
                  </span>
                )}
                {profile && (
                  <span>
                    <strong>Vínculo</strong>
                    {profile.affiliationStatus ?? "Não informado"}
                  </span>
                )}
              </div>
            </div>
          </section>

          <div className="profile-settings-grid">
            <form className="profile-form" onSubmit={(event) => void saveProfile(event)}>
              <header className="profile-form-heading">
                <div>
                  <p className="eyebrow">Dados visíveis no Campus</p>
                  <h2>Dados acadêmicos e pessoais</h2>
                  <p>Revise as informações vinculadas ao seu perfil UNIR.</p>
                </div>
                <span className="profile-form-lock">
                  <Icon name="lock" width="15" height="15" /> Matrícula protegida
                </span>
              </header>

              <label className="field">
                <span>Nome completo</span>
                <input
                  autoComplete="name"
                  maxLength={255}
                  required
                  value={form.name}
                  onChange={(event) => {
                    setForm({ ...form, name: event.target.value });
                    setSaved(false);
                  }}
                />
              </label>

              <label className="field">
                <span>E-mail da conta</span>
                <input autoComplete="email" readOnly value={accountEmail} />
                <small className={emailVerified ? "field-success" : ""}>
                  {emailVerified
                    ? "E-mail autenticado pelo provedor institucional."
                    : "Gerenciado pelo provedor de acesso."}
                </small>
              </label>

              <label className="field">
                <span>Situação acadêmica</span>
                <select
                  required
                  value={form.affiliationStatus}
                  onChange={(event) => {
                    setForm({ ...form, affiliationStatus: event.target.value as AffiliationStatus | "" });
                    setSaved(false);
                  }}
                >
                  <option value="">Selecione sua situação</option>
                  <option value="STUDENT">Aluno</option>
                  <option value="PROFESSOR">Professor</option>
                  <option value="ALUMNI">Egresso</option>
                </select>
                <small>Informada por você; a seleção não representa uma validação institucional.</small>
              </label>

              <label className="field">
                <span>Nível acadêmico</span>
                <select
                  required
                  value={form.academicLevel}
                  onChange={(event) => {
                    setForm({ ...form, academicLevel: event.target.value as AcademicLevel | "" });
                    setSaved(false);
                  }}
                >
                  <option value="">Selecione seu nível</option>
                  <option value="UNDERGRADUATE">Graduação</option>
                  <option value="MASTERS">Mestrado</option>
                  <option value="DOCTORATE">Doutorado</option>
                </select>
                <small>
                  Para aluno, informe o nível em andamento; para professor ou egresso, o mais alto concluído.
                </small>
              </label>

              <label className="field">
                <span>Matrícula</span>
                <input
                  maxLength={255}
                  required
                  readOnly={Boolean(profile)}
                  value={form.institutionalId}
                  onChange={(event) => {
                    setForm({ ...form, institutionalId: event.target.value });
                    setSaved(false);
                  }}
                />
                {profile && <small>A matrícula fica fixa depois da criação do perfil.</small>}
              </label>

              <label className="field">
                <span>Curso</span>
                <input
                  maxLength={255}
                  required
                  value={form.course}
                  onChange={(event) => {
                    setForm({ ...form, course: event.target.value });
                    setSaved(false);
                  }}
                />
              </label>

              <label className="field profile-field-full">
                <span>Departamento</span>
                <input
                  maxLength={255}
                  required
                  value={form.department}
                  onChange={(event) => {
                    setForm({ ...form, department: event.target.value });
                    setSaved(false);
                  }}
                />
              </label>

              <label className="field profile-field-full">
                <span>Temas e interesses acadêmicos</span>
                <textarea
                  rows={3}
                  placeholder="Um interesse por linha"
                  value={form.interests}
                  onChange={(event) => {
                    setForm({ ...form, interests: event.target.value });
                    setSaved(false);
                  }}
                />
                <small>Adicione um interesse em cada linha.</small>
              </label>

              {error && (
                <p className="notice notice-error" role="alert">
                  {error}
                </p>
              )}
              {saved && (
                <p className="notice notice-success" role="status">
                  Perfil salvo.
                </p>
              )}

              <div className="form-actions">
                <button className="button button-primary" disabled={!dirty || saving} type="submit">
                  {saving ? "Salvando…" : profile ? "Salvar alterações" : "Criar perfil"}
                </button>
                {dirty && !saving && (
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => {
                      setForm(savedForm);
                      setError("");
                      setSaved(false);
                    }}
                  >
                    Descartar
                  </button>
                )}
              </div>
            </form>

            <aside className="profile-side-stack">
              <section className="account-panel profile-security-card" aria-labelledby="profile-security-title">
                <span className="profile-side-icon">
                  <Icon name="shield" width="19" height="19" />
                </span>
                <p className="eyebrow">Acesso seguro</p>
                <h2 id="profile-security-title">Sua conta institucional</h2>
                <p>
                  {emailVerified
                    ? "Seu e-mail foi confirmado pelo provedor de identidade."
                    : "O acesso e o e-mail são gerenciados pelo provedor de identidade da universidade."}
                </p>
                <Link className="text-link" to="/perfil/seguranca">
                  Revisar segurança <Icon name="arrowUpRight" width="15" height="15" />
                </Link>
              </section>

              <section className="account-panel profile-privacy-card" aria-labelledby="profile-privacy-title">
                <p className="eyebrow">Sobre seus dados</p>
                <h2 id="profile-privacy-title">Mantenha o perfil correto</h2>
                <p>
                  Matrícula, curso e vínculo ajudam a contextualizar sua participação nos espaços acadêmicos da UNIR.
                  Atualize os campos quando seu vínculo mudar.
                </p>
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
