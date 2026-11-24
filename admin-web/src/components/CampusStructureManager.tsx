import { useState, type FormEvent } from "react";
import { AdminModal } from "./AdminModal";
import { useToast } from "../contexts/ToastContext";
import {
  createAcademicUnit,
  createCourse,
  createDepartment,
  createSemester,
  updateSemester,
  type CampusOverview,
} from "../services/campusOverview";
import { extractErrorMessage } from "../utils/apiError";

interface CampusStructureManagerProps {
  gatewayUrl: string;
  token: string;
  overview: CampusOverview;
  onSaved: () => Promise<void>;
}

type CreateTab = "unit" | "department" | "course";

export function CampusStructureManager({ gatewayUrl, token, overview, onSaved }: CampusStructureManagerProps) {
  const toast = useToast();
  const [tab, setTab] = useState<CreateTab>("unit");
  const [busy, setBusy] = useState(false);
  const [unitCode, setUnitCode] = useState("");
  const [unitName, setUnitName] = useState("");
  const [unitDescription, setUnitDescription] = useState("");
  const [departmentAcronym, setDepartmentAcronym] = useState("");
  const [departmentName, setDepartmentName] = useState("");
  const [departmentDescription, setDepartmentDescription] = useState("");
  const [courseDepartmentId, setCourseDepartmentId] = useState("");
  const [courseName, setCourseName] = useState("");
  const [semesterId, setSemesterId] = useState<string | null>(null);
  const [semesterDraft, setSemesterDraft] = useState({ name: "", startOn: "", endOn: "" });

  async function saveStructure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      if (tab === "unit") {
        await createAcademicUnit(gatewayUrl, token, {
          code: unitCode.trim().toUpperCase(),
          name: unitName.trim(),
          description: unitDescription.trim(),
          generalInfoMarkdown: unitDescription.trim() || `Unidade acadêmica ${unitName.trim()}.`,
        });
        setUnitCode("");
        setUnitName("");
        setUnitDescription("");
        toast.success("Unidade acadêmica criada com sucesso.");
      } else if (tab === "department") {
        await createDepartment(gatewayUrl, token, {
          acronym: departmentAcronym.trim().toUpperCase(),
          name: departmentName.trim(),
          description: departmentDescription.trim(),
          generalInfoMarkdown: departmentDescription.trim() || `Departamento ${departmentName.trim()}.`,
        });
        setDepartmentAcronym("");
        setDepartmentName("");
        setDepartmentDescription("");
        toast.success("Departamento criado com sucesso.");
      } else {
        const departmentId = courseDepartmentId || overview.departments.items[0]?.id || "";
        await createCourse(gatewayUrl, token, { departmentId, name: courseName.trim() });
        setCourseName("");
        toast.success("Curso criado com sucesso.");
      }
      await onSaved();
    } catch (error) {
      toast.error(extractErrorMessage(error, "Não foi possível criar a estrutura."));
    } finally {
      setBusy(false);
    }
  }

  const [semesterOpen, setSemesterOpen] = useState(false);

  function openSemester(semester?: NonNullable<CampusOverview["semesters"]>["items"][number]) {
    setSemesterId(semester?.id ?? null);
    setSemesterDraft({ name: semester?.name ?? "", startOn: semester?.startOn ?? "", endOn: semester?.endOn ?? "" });
    setSemesterOpen(true);
  }

  async function saveSemester(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const saved = semesterId
        ? await updateSemester(gatewayUrl, token, semesterId, semesterDraft)
        : await createSemester(gatewayUrl, token, semesterDraft);
      setSemesterDraft({ name: "", startOn: "", endOn: "" });
      setSemesterOpen(false);
      setSemesterId(null);
      toast.success(`Semestre ${saved.name} salvo com sucesso.`);
      await onSaved();
    } catch (error) {
      toast.error(extractErrorMessage(error, "Não foi possível salvar o semestre."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="admin-card admin-manage-card" aria-labelledby="create-structure-title">
        <div className="admin-directory-heading">
          <h2 id="create-structure-title">Criar estrutura acadêmica</h2>
        </div>
        <div className="admin-tabs" role="tablist" aria-label="Tipo de estrutura">
          {(
            [
              ["unit", "Unidade acadêmica"],
              ["department", "Departamento"],
              ["course", "Curso"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              className={tab === value ? "is-active" : ""}
              onClick={() => setTab(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <form className="admin-form" onSubmit={(event) => void saveStructure(event)}>
          {tab === "unit" && (
            <>
              <div className="admin-form-row">
                <label>
                  <span>Sigla</span>
                  <input
                    required
                    value={unitCode}
                    onChange={(event) => setUnitCode(event.target.value)}
                    placeholder="ICET"
                  />
                </label>
                <label>
                  <span>Nome da unidade</span>
                  <input required value={unitName} onChange={(event) => setUnitName(event.target.value)} />
                </label>
              </div>
              <label>
                <span>Descrição</span>
                <textarea
                  rows={3}
                  value={unitDescription}
                  onChange={(event) => setUnitDescription(event.target.value)}
                />
              </label>
            </>
          )}
          {tab === "department" && (
            <>
              <div className="admin-form-row">
                <label>
                  <span>Sigla</span>
                  <input
                    required
                    value={departmentAcronym}
                    onChange={(event) => setDepartmentAcronym(event.target.value)}
                    placeholder="DCC"
                  />
                </label>
                <label>
                  <span>Nome do departamento</span>
                  <input required value={departmentName} onChange={(event) => setDepartmentName(event.target.value)} />
                </label>
              </div>
              <label>
                <span>Descrição</span>
                <textarea
                  rows={3}
                  value={departmentDescription}
                  onChange={(event) => setDepartmentDescription(event.target.value)}
                />
              </label>
            </>
          )}
          {tab === "course" && (
            <div className="admin-form-row">
              <label>
                <span>Departamento</span>
                <select
                  required
                  value={courseDepartmentId || overview.departments.items[0]?.id || ""}
                  onChange={(event) => setCourseDepartmentId(event.target.value)}
                >
                  <option value="">Selecione…</option>
                  {overview.departments.items.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.acronym} — {department.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Nome do curso</span>
                <input required value={courseName} onChange={(event) => setCourseName(event.target.value)} />
              </label>
            </div>
          )}
          <div className="admin-dialog-actions">
            <button
              type="submit"
              className="btn-primary"
              disabled={busy || (tab === "course" && overview.departments.items.length === 0)}
            >
              {busy ? "Salvando…" : "Cadastrar"}
            </button>
          </div>
        </form>
      </section>
      <section className="admin-card admin-manage-card" aria-labelledby="semester-title">
        <div className="admin-directory-heading admin-semester-heading">
          <h2 id="semester-title">Semestres acadêmicos</h2>
          <button type="button" className="btn-primary" onClick={() => openSemester()}>
            + Adicionar semestre
          </button>
        </div>
        <div className="admin-semester-list">
          {overview.semesters?.items.map((semester) => (
            <button
              key={semester.id}
              type="button"
              className="btn-secondary admin-semester-entry"
              onClick={() => openSemester(semester)}
              aria-label={`Editar semestre ${semester.name}`}
            >
              <span className="admin-semester-details">
                <strong>{semester.name}</strong>
                <span>
                  {semester.startOn?.split("-").reverse().join("/")} a {semester.endOn?.split("-").reverse().join("/")}
                </span>
              </span>
              <span className="admin-semester-edit" aria-hidden="true">
                Editar
              </span>
            </button>
          ))}
          {!overview.semesters?.items.length && <p className="admin-empty-note">Nenhum semestre cadastrado.</p>}
        </div>
      </section>
      {semesterOpen && (
        <AdminModal
          eyebrow="Calendário acadêmico"
          title={semesterId ? "Editar semestre" : "Adicionar semestre"}
          closeDisabled={busy}
          onClose={() => setSemesterOpen(false)}
        >
          <form className="admin-form admin-dialog-form" onSubmit={(event) => void saveSemester(event)}>
            <label>
              <span>Nome (AAAA/1 ou AAAA/2)</span>
              <input
                required
                pattern="[0-9]{4}/[12]"
                placeholder="Ex.: 2027/1"
                value={semesterDraft.name}
                onChange={(event) => setSemesterDraft((current) => ({ ...current, name: event.target.value }))}
              />
            </label>
            <div className="admin-form-row">
              <label>
                <span>Início</span>
                <input
                  required
                  type="date"
                  value={semesterDraft.startOn}
                  onChange={(event) => setSemesterDraft((current) => ({ ...current, startOn: event.target.value }))}
                />
              </label>
              <label>
                <span>Fim</span>
                <input
                  required
                  type="date"
                  min={semesterDraft.startOn}
                  value={semesterDraft.endOn}
                  onChange={(event) => setSemesterDraft((current) => ({ ...current, endOn: event.target.value }))}
                />
              </label>
            </div>
            <div className="admin-dialog-actions">
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => setSemesterOpen(false)}>
                Cancelar
              </button>
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? "Salvando…" : semesterId ? "Salvar alterações" : "Adicionar semestre"}
              </button>
            </div>
          </form>
        </AdminModal>
      )}
    </>
  );
}
