import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useOutletContext } from "react-router-dom";
import type Keycloak from "keycloak-js";
import { Icon } from "../components/Icon";
import { useToast } from "../contexts/ToastContext";
import { extractErrorMessage } from "../utils/apiError.js";
import {
  getCourses,
  getDepartments,
  getUniversity,
  type CatalogCourse,
  type Department,
  type University,
} from "../services/campus.js";
import {
  createProfessorVerificationRequest,
  getMyProfessorVerificationRequests,
  OpportunityApiError,
  type ProfessorVerificationRequest,
} from "../services/opportunities.js";
import { shouldPromptForProfessorVerification } from "./profileFlow.js";
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
  courseId: string;
  departmentId: string;
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
  courseId: "",
  departmentId: "",
  interests: "",
};

function formFromProfile(profile: UserProfile): ProfileForm {
  return {
    name: profile.name,
    institutionalId: profile.institutionalId,
    affiliationStatus: profile.affiliationStatus ?? "",
    academicLevel: profile.academicLevel ?? "",
    courseId: profile.courseId ?? "",
    departmentId: profile.departmentId ?? "",
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
  return extractErrorMessage(
    error,
    "Não foi possível carregar ou salvar seu perfil. Verifique o serviço Campus e tente novamente.",
  );
}

export function ProfilePage() {
  const { keycloak } = useOutletContext<AccountContext>();
  const toast = useToast();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [form, setForm] = useState<ProfileForm>(emptyForm);
  const [savedForm, setSavedForm] = useState<ProfileForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preparingProfessorRequest, setPreparingProfessorRequest] = useState(false);
  const [professorConfirmationOpen, setProfessorConfirmationOpen] = useState(false);
  const [university, setUniversity] = useState<University | null>(null);
  const [courses, setCourses] = useState<CatalogCourse[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentsLoadFailed, setDepartmentsLoadFailed] = useState(false);
  const [catalogLoadFailed, setCatalogLoadFailed] = useState(false);
  const [coursesLoadFailed, setCoursesLoadFailed] = useState(false);
  const [professorRequest, setProfessorRequest] = useState<ProfessorVerificationRequest | null>(null);
  const [professorRequestLoadFailed, setProfessorRequestLoadFailed] = useState(false);
  const professorDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      try {
        await keycloak.updateToken(30);
        if (!keycloak.token) throw new Error("Token de acesso indisponível.");
        const currentProfile = await getMyProfile(keycloak.token);
        try {
          const [universityResult, departmentPage] = await Promise.all([
            getUniversity(keycloak.token),
            getDepartments(keycloak.token, 0, 100),
          ]);
          if (active) {
            setUniversity(universityResult);
            setDepartments(departmentPage.items);
            setDepartmentsLoadFailed(false);
            setCatalogLoadFailed(false);
          }
        } catch {
          if (active) {
            setDepartmentsLoadFailed(true);
            setCatalogLoadFailed(true);
          }
        }
        if (active) {
          const nextForm = currentProfile ? formFromProfile(currentProfile) : emptyForm;
          setProfile(currentProfile);
          setForm(nextForm);
          setSavedForm(nextForm);
        }

        try {
          const { items } = await getMyProfessorVerificationRequests(keycloak.token);
          if (active) {
            setProfessorRequest(items[0] ?? null);
            setProfessorRequestLoadFailed(false);
          }
        } catch {
          if (active) setProfessorRequestLoadFailed(true);
        }
      } catch (loadError) {
        if (active) {
          toast.error(errorMessage(loadError));
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
  }, [keycloak, toast]);

  useEffect(() => {
    let active = true;
    setCourses([]);
    setCoursesLoadFailed(false);
    if (!form.departmentId)
      return () => {
        active = false;
      };

    async function loadCourses() {
      try {
        await keycloak.updateToken(30);
        if (!keycloak.token) throw new Error("Token de acesso indisponível.");
        const page = await getCourses(keycloak.token, form.departmentId, 0, 100);
        if (active) setCourses(page.items);
      } catch {
        if (active) setCoursesLoadFailed(true);
      }
    }

    void loadCourses();
    return () => {
      active = false;
    };
  }, [form.departmentId, keycloak]);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(savedForm), [form, savedForm]);
  const displayName = profile?.name || String(keycloak.tokenParsed?.name ?? "");
  const avatarInitial = displayName.trim().charAt(0).toLocaleUpperCase("pt-BR") || "U";
  const accountEmail = String(keycloak.tokenParsed?.email ?? profile?.email ?? "");
  const emailVerified = Boolean(keycloak.tokenParsed?.email_verified);
  const selectedDepartment = departments.find((department) => department.id === form.departmentId) ?? null;
  const selectedCourse = courses.find((course) => course.id === form.courseId) ?? null;

  useEffect(() => {
    const dialog = professorDialogRef.current;
    if (!dialog) return;
    if (professorConfirmationOpen && !dialog.open) dialog.showModal();
    if (!professorConfirmationOpen && dialog.open) dialog.close();
  }, [professorConfirmationOpen]);

  async function saveProfileRecord(token: string): Promise<UserProfile> {
    const affiliationStatus = form.affiliationStatus;
    const academicLevel = form.academicLevel;
    if (!affiliationStatus || !academicLevel) throw new Error("Selecione sua situação e seu nível acadêmico.");

    const profileFields = {
      name: form.name,
      institutionalId: form.institutionalId,
      affiliationStatus,
      academicLevel,
      courseId: form.courseId,
      departmentId: form.departmentId,
      interests: interestsFromForm(form.interests),
    };
    return profile
      ? updateMyProfile(token, profileFields)
      : createMyProfile(token, { ...profileFields, institutionalId: form.institutionalId });
  }

  function applySavedProfile(updatedProfile: UserProfile, message = "Perfil salvo.") {
    const nextForm = formFromProfile(updatedProfile);
    setProfile(updatedProfile);
    setForm(nextForm);
    setSavedForm(nextForm);
    toast.success(message);
  }

  async function openProfessorRequestConfirmation(savedProfile: UserProfile) {
    setPreparingProfessorRequest(true);
    try {
      if (catalogLoadFailed || departmentsLoadFailed || departments.length === 0) {
        toast.error("Perfil salvo, mas não foi possível validar o departamento cadastrado no Campus.");
        return;
      }
      if (
        !savedProfile.departmentId ||
        !departments.some((department) => department.id === savedProfile.departmentId)
      ) {
        toast.error(
          "Selecione um departamento existente nos dados acadêmicos do perfil antes de solicitar a verificação.",
        );
        return;
      }
      setProfessorConfirmationOpen(true);
    } finally {
      setPreparingProfessorRequest(false);
    }
  }

  async function startProfessorRequest() {
    if (
      profile?.affiliationStatus !== "PROFESSOR" ||
      !profile.departmentId ||
      professorRequest ||
      professorRequestLoadFailed
    )
      return;
    setPreparingProfessorRequest(true);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token de acesso indisponível.");
      await openProfessorRequestConfirmation(profile);
    } catch {
      setPreparingProfessorRequest(false);
      toast.error("Não foi possível preparar a solicitação. Atualize a página e tente novamente.");
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty) return;
    const shouldPromptForRequest = shouldPromptForProfessorVerification(
      form.affiliationStatus,
      professorRequest?.status ?? null,
    );

    setSaving(true);

    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token de acesso indisponível.");
      const token = keycloak.token;
      const savedProfile = await saveProfileRecord(token);
      if (shouldPromptForRequest) {
        if (professorRequestLoadFailed) {
          applySavedProfile(savedProfile);
          toast.error("Perfil salvo, mas não foi possível confirmar se já existe uma solicitação docente em aberto.");
        } else {
          applySavedProfile(savedProfile, "Perfil salvo. Confira seus dados antes de confirmar a solicitação docente.");
          await openProfessorRequestConfirmation(savedProfile);
        }
      } else {
        applySavedProfile(savedProfile);
      }
    } catch (saveError) {
      toast.error(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function confirmProfessorRequest() {
    if (!profile?.departmentId || !departments.some((department) => department.id === profile.departmentId)) return;
    setSaving(true);

    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token de acesso indisponível.");

      const token = keycloak.token;
      try {
        const createdRequest = await createProfessorVerificationRequest(token);
        setProfessorRequest({
          ...createdRequest,
          requesterName: createdRequest.requesterName ?? form.name,
          targetDepartmentName: createdRequest.targetDepartmentName ?? profile.department,
          payload: createdRequest.payload ?? { identifier: form.institutionalId },
        });
        setProfessorRequestLoadFailed(false);
        setProfessorConfirmationOpen(false);
        toast.success(`Solicitação enviada. Protocolo ${createdRequest.id}.`);
      } catch (requestError) {
        if (requestError instanceof OpportunityApiError && requestError.status === 409) {
          try {
            const { items } = await getMyProfessorVerificationRequests(token);
            const latestRequest = items[0] ?? null;
            setProfessorRequest(latestRequest);
            setProfessorRequestLoadFailed(false);
            setProfessorConfirmationOpen(false);
            if (latestRequest) {
              toast.info(`Já existe uma solicitação. Protocolo ${latestRequest.id}.`);
              return;
            }
          } catch {
            setProfessorRequestLoadFailed(true);
          }
        }
        toast.error(
          requestError instanceof OpportunityApiError && requestError.status === 409
            ? "Perfil salvo, mas já existe uma solicitação pendente ou um vínculo docente ativo para esse departamento."
            : extractErrorMessage(
                requestError,
                "Perfil salvo, mas não foi possível enviar a solicitação docente. Revise os dados e tente novamente.",
              ),
        );
      }
    } catch (saveError) {
      toast.error(errorMessage(saveError));
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
        <button className="button button-secondary retry-button" onClick={() => window.location.reload()}>
          Tentar novamente
        </button>
      ) : (
        <>
          <section className="profile-hero-card" aria-label="Resumo do perfil">
            <div className="profile-hero-banner">
              <span className="profile-campus-badge">{university?.acronym ?? "UNIR"} · REDE UNIVERSITÁRIA</span>
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
                    <strong>Matrícula / SIAPE</strong>
                    {profile.institutionalId}
                  </span>
                )}
                {profile && (
                  <span>
                    <strong>Situação informada</strong>
                    {profile.affiliationStatus === "PROFESSOR"
                      ? "Professor (autodeclarado)"
                      : (profile.affiliationStatus ?? "Não informado")}
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
                <span className="profile-form-lock">Matrícula ou SIAPE</span>
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

              {form.affiliationStatus === "PROFESSOR" && (
                <div className="profile-professor-warning" role="note">
                  <strong>Importante: autodeclaração não atribui role nem permissão docente.</strong>
                  <span>
                    Se você é professor, preencha corretamente seu nome, matrícula/SIAPE, e-mail e departamento. Ao
                    salvar as edições do perfil, você poderá revisar esses dados e confirmar o envio do pedido. Seu
                    perfil pode exibir “Professor”, mas o vínculo e as permissões docentes só passam a valer após a
                    aprovação institucional. Se um pedido for recusado e a universidade entender que ele foi malicioso,
                    seu acesso à plataforma poderá ser revogado.
                  </span>
                </div>
              )}

              <label className="field">
                <span>Matrícula / SIAPE</span>
                <input
                  maxLength={255}
                  placeholder="Informe sua matrícula ou SIAPE"
                  required
                  value={form.institutionalId}
                  onChange={(event) => {
                    setForm({ ...form, institutionalId: event.target.value });
                  }}
                />
                <small>Informe sua matrícula ou seu SIAPE, conforme seu vínculo institucional.</small>
              </label>

              <label className="field">
                <span>Departamento</span>
                <select
                  required
                  value={form.departmentId}
                  disabled={catalogLoadFailed || departmentsLoadFailed}
                  onChange={(event) => {
                    setForm({ ...form, departmentId: event.target.value, courseId: "" });
                  }}
                >
                  <option value="">
                    {departmentsLoadFailed ? "Departamentos indisponíveis" : "Selecione seu departamento"}
                  </option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name} ({department.acronym})
                    </option>
                  ))}
                </select>
                <small>O departamento selecionado define os cursos disponíveis no catálogo do Campus.</small>
              </label>

              <label className="field">
                <span>Curso</span>
                <select
                  required
                  value={form.courseId}
                  disabled={!selectedDepartment || coursesLoadFailed}
                  onChange={(event) => {
                    setForm({ ...form, courseId: event.target.value });
                  }}
                >
                  <option value="">
                    {coursesLoadFailed
                      ? "Cursos indisponíveis"
                      : selectedDepartment
                        ? "Selecione seu curso"
                        : "Selecione primeiro o departamento"}
                  </option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name}
                    </option>
                  ))}
                </select>
                <small>
                  {selectedCourse
                    ? `Curso cadastrado em ${selectedDepartment?.name ?? "seu departamento"}.`
                    : "Selecione um curso cadastrado para o departamento escolhido."}
                </small>
              </label>

              <label className="field profile-field-full">
                <span>Temas e interesses acadêmicos</span>
                <textarea
                  rows={3}
                  placeholder="Um interesse por linha"
                  value={form.interests}
                  onChange={(event) => {
                    setForm({ ...form, interests: event.target.value });
                  }}
                />
                <small>Adicione um interesse em cada linha.</small>
              </label>

              <div className="form-actions">
                <button
                  className="button button-primary"
                  disabled={!dirty || saving || preparingProfessorRequest}
                  type="submit"
                >
                  {preparingProfessorRequest
                    ? "Consultando departamentos…"
                    : saving
                      ? "Salvando…"
                      : profile
                        ? "Salvar alterações"
                        : "Criar perfil"}
                </button>
                {dirty && !saving && !preparingProfessorRequest && (
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => {
                      setForm(savedForm);
                    }}
                  >
                    Descartar
                  </button>
                )}
              </div>
            </form>

            <aside className="profile-side-stack">
              <section className="account-panel profile-verification-card" aria-labelledby="profile-verification-title">
                <span className="profile-side-icon">
                  <Icon name="shield" width="19" height="19" />
                </span>
                <p className="eyebrow">Vínculo docente</p>
                {professorRequest?.status === "PENDING" ? (
                  <>
                    <h2 id="profile-verification-title">Solicitação de professor em aberto</h2>
                    <span className="profile-verification-status is-pending">Em análise pelo departamento</span>
                    <dl className="profile-verification-details">
                      <div>
                        <dt>Protocolo</dt>
                        <dd>{professorRequest.id}</dd>
                      </div>
                      <div>
                        <dt>Departamento</dt>
                        <dd>{professorRequest.targetDepartmentName ?? professorRequest.targetDepartmentId}</dd>
                      </div>
                    </dl>
                    <p>
                      “Professor” no perfil continua sendo uma situação informada. O vínculo e as permissões docentes
                      dependem da aprovação institucional.
                    </p>
                  </>
                ) : professorRequest?.status === "APPROVED" ? (
                  <>
                    <h2 id="profile-verification-title">Vínculo docente aprovado</h2>
                    <span className="profile-verification-status is-approved">Aprovado pelo departamento</span>
                    <p>
                      Sua solicitação foi aprovada. A autorização docente é confirmada pelo vínculo institucional,
                      independentemente do texto autodeclarado no perfil.
                    </p>
                  </>
                ) : professorRequest?.status === "REJECTED" ? (
                  <>
                    <h2 id="profile-verification-title">Solicitação recusada</h2>
                    <span className="profile-verification-status is-rejected">Sem vínculo docente aprovado</span>
                    <dl className="profile-verification-details">
                      <div>
                        <dt>Protocolo</dt>
                        <dd>{professorRequest.id}</dd>
                      </div>
                      <div>
                        <dt>Departamento</dt>
                        <dd>{professorRequest.targetDepartmentName ?? professorRequest.targetDepartmentId}</dd>
                      </div>
                    </dl>
                    <p>O status “Professor” permanece apenas como informação autodeclarada no perfil.</p>
                  </>
                ) : professorRequestLoadFailed ? (
                  <>
                    <h2 id="profile-verification-title">Status indisponível</h2>
                    <p>Não foi possível consultar se existe uma solicitação docente em aberto. Atualize a página.</p>
                  </>
                ) : profile?.affiliationStatus === "PROFESSOR" ? (
                  <>
                    <h2 id="profile-verification-title">Professor autodeclarado</h2>
                    <p>
                      Seu perfil ainda não tem um pedido de verificação. O vínculo docente só passa a valer após a
                      aprovação do departamento.
                    </p>
                    <button
                      className="button button-secondary"
                      type="button"
                      disabled={preparingProfessorRequest}
                      onClick={() => void startProfessorRequest()}
                    >
                      {preparingProfessorRequest ? "Preparando solicitação…" : "Solicitar verificação docente"}
                    </button>
                  </>
                ) : (
                  <>
                    <h2 id="profile-verification-title">Verificação docente</h2>
                    <p>Selecione “Professor” e salve o perfil para revisar e enviar uma solicitação ao departamento.</p>
                  </>
                )}
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

          <dialog
            ref={professorDialogRef}
            className="profile-professor-confirmation"
            aria-labelledby="profile-professor-confirmation-title"
            aria-describedby="profile-professor-confirmation-copy"
            onCancel={() => setProfessorConfirmationOpen(false)}
          >
            <div className="profile-professor-confirmation-content">
              <p className="eyebrow">Verificação institucional</p>
              <h2 id="profile-professor-confirmation-title">Confira o pedido de verificação docente</h2>
              <p id="profile-professor-confirmation-copy">
                O pedido usará os dados acadêmicos salvos abaixo. Para corrigir algum dado, volte ao perfil, edite os
                campos e salve antes de confirmar.
              </p>

              <dl className="profile-professor-confirmation-data">
                <div>
                  <dt>Nome</dt>
                  <dd>{profile?.name || "Não informado"}</dd>
                </div>
                <div>
                  <dt>E-mail da conta</dt>
                  <dd>{accountEmail || "Não informado"}</dd>
                </div>
                <div>
                  <dt>Matrícula / SIAPE</dt>
                  <dd>{profile?.institutionalId || "Não informado"}</dd>
                </div>
                <div>
                  <dt>Curso</dt>
                  <dd>{profile?.course || "Não informado"}</dd>
                </div>
                <div>
                  <dt>Departamento</dt>
                  <dd>{profile?.department || "Não informado"}</dd>
                </div>
              </dl>

              <p className="profile-professor-confirmation-note">
                A autodeclaração não atribui role nem permissão. O vínculo docente só será confirmado após a aprovação
                do departamento. Se um pedido for recusado e a universidade considerar que houve má-fé, o acesso à
                plataforma poderá ser revogado. Depois do envio, o protocolo ficará visível ao lado do perfil.
              </p>

              <div className="profile-professor-confirmation-actions">
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={saving}
                  onClick={() => setProfessorConfirmationOpen(false)}
                >
                  Voltar e editar perfil
                </button>
                <button
                  className="button button-primary"
                  type="button"
                  disabled={
                    saving ||
                    !profile?.departmentId ||
                    !departments.some((department) => department.id === profile.departmentId)
                  }
                  onClick={() => void confirmProfessorRequest()}
                >
                  {saving ? "Enviando…" : "Confirmar e enviar pedido"}
                </button>
              </div>
            </div>
          </dialog>
        </>
      )}
    </div>
  );
}
