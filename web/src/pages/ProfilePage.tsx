import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useOutletContext } from "react-router-dom";
import type Keycloak from "keycloak-js";
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
    <>
      <div className="page-intro">
        <h2>Seus dados na UNIR</h2>
        <p>
          Edite as informações que ajudam outras pessoas a encontrar você na comunidade universitária. Egressos também
          fazem parte da comunidade UNIR.
        </p>
      </div>

      {loading ? (
        <p className="notice">Carregando seu perfil…</p>
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
        <form className="profile-form" onSubmit={(event) => void saveProfile(event)}>
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
            <span>Situação</span>
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
            <small>Informado por você. A seleção não é validada pela UFLA.</small>
          </label>

          <label className="field">
            <span>Nível de formação</span>
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
            <small>Para aluno, informe o nível em andamento; para professor ou egresso, o mais alto concluído.</small>
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

          <div className="field-row">
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
            <label className="field">
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
          </div>

          <label className="field">
            <span>Interesses</span>
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
      )}
    </>
  );
}
