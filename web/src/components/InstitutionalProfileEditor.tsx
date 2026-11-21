import { useState, type FormEvent } from "react";
import {
  CampusApiError,
  updateInstitutionalProfile,
  type AcademicEntity,
  type AcademicUnit,
  type Community,
  type Department,
  type University,
} from "../services/campus";
import type { InstitutionalProfileType } from "../services/campusSocial";

type EditableProfile = Pick<
  University,
  "name" | "description" | "generalInfoMarkdown" | "logoUrl" | "bannerUrl" | "links"
> & {
  id: string;
  viewerCanManage?: boolean;
  administratorUserIds?: string[] | null;
};

interface InstitutionalProfileEditorProps {
  token: string;
  type: InstitutionalProfileType;
  profileId: string;
  profile: EditableProfile | Department | AcademicUnit | AcademicEntity | Community;
  onSaved: (profile: Record<string, unknown>) => void;
}

function errorMessage(error: unknown): string {
  if (error instanceof CampusApiError && error.status === 403)
    return "Somente administradores deste perfil podem editá-lo.";
  if (error instanceof CampusApiError && error.status === 422)
    return "Revise os campos. O Campus recusou os dados informados.";
  return "Não foi possível salvar as informações do perfil.";
}

function formatLinks(links: unknown[]): string {
  return links
    .map((item) => {
      if (typeof item === "string") return item;
      if (!item || typeof item !== "object" || Array.isArray(item)) return "";
      const link = item as { label?: unknown; url?: unknown };
      if (typeof link.url !== "string") return "";
      return `${typeof link.label === "string" && link.label.trim() ? link.label.trim() : link.url} | ${link.url}`;
    })
    .filter(Boolean)
    .join("\n");
}

function parseLinks(value: string): unknown[] | null {
  const links: unknown[] = [];
  for (const line of value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)) {
    const separator = line.indexOf("|");
    const label = separator >= 0 ? line.slice(0, separator).trim() : "";
    const url = (separator >= 0 ? line.slice(separator + 1) : line).trim();
    let protocol: string;
    try {
      protocol = new URL(url).protocol;
    } catch {
      return null;
    }
    if (!url || !["http:", "https:", "mailto:", "tel:"].includes(protocol) || url.startsWith("//")) return null;
    links.push(separator >= 0 ? { label: label || url, url } : url);
  }
  return links;
}

export function InstitutionalProfileEditor({
  token,
  type,
  profileId,
  profile,
  onSaved,
}: InstitutionalProfileEditorProps) {
  const [name, setName] = useState(profile.name);
  const [description, setDescription] = useState(profile.description);
  const [generalInfoMarkdown, setGeneralInfoMarkdown] = useState(profile.generalInfoMarkdown);
  const [logoUrl, setLogoUrl] = useState(profile.logoUrl ?? "");
  const [bannerUrl, setBannerUrl] = useState(profile.bannerUrl ?? "");
  const [links, setLinks] = useState(formatLinks(profile.links ?? []));
  const [administratorUserIds, setAdministratorUserIds] = useState((profile.administratorUserIds ?? []).join("\n"));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedLinks = parseLinks(links);
    if (!parsedLinks) {
      setError("Informe uma URL válida por linha. Para adicionar um nome, use: Nome do link | https://exemplo.br");
      return;
    }
    const parsedAdmins = [
      ...new Set(
        administratorUserIds
          .split(/\r?\n/)
          .map((subject) => subject.trim())
          .filter(Boolean),
      ),
    ];

    setSaving(true);
    setError("");
    try {
      const updated = await updateInstitutionalProfile(token, type, profileId, {
        name,
        description,
        generalInfoMarkdown,
        logoUrl: logoUrl || null,
        bannerUrl: bannerUrl || null,
        links: parsedLinks,
        administratorUserIds: parsedAdmins,
      });
      onSaved(updated as Record<string, unknown>);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  if (!profile.viewerCanManage) return null;

  return (
    <details className="campus-profile-editor">
      <summary>Editar informações do perfil</summary>
      <form className="campus-post-composer" onSubmit={(event) => void save(event)}>
        <label className="field">
          <span>Nome</span>
          <input required maxLength={255} value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="field">
          <span>Descrição</span>
          <textarea required rows={2} value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <label className="field">
          <span>Informações em Markdown</span>
          <textarea
            required
            rows={7}
            value={generalInfoMarkdown}
            onChange={(event) => setGeneralInfoMarkdown(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Logo (URL opcional)</span>
          <input type="url" value={logoUrl} onChange={(event) => setLogoUrl(event.target.value)} />
        </label>
        <label className="field">
          <span>Banner (URL opcional)</span>
          <input type="url" value={bannerUrl} onChange={(event) => setBannerUrl(event.target.value)} />
        </label>
        <label className="field">
          <span>Links e contatos</span>
          <textarea rows={4} value={links} onChange={(event) => setLinks(event.target.value)} />
          <small>
            Um por linha. Use a URL ou escreva um rótulo seguido de “|” e a URL. Aceita sites, e-mail e telefone.
          </small>
        </label>
        <label className="field">
          <span>Administradores</span>
          <textarea
            rows={4}
            value={administratorUserIds}
            onChange={(event) => setAdministratorUserIds(event.target.value)}
          />
          <small>
            Um ID de usuário do Keycloak por linha. Mantenha seu ID para continuar administrando este perfil.
          </small>
        </label>
        {error && (
          <p className="notice notice-error" role="alert">
            {error}
          </p>
        )}
        <button className="button button-primary" disabled={saving} type="submit">
          {saving ? "Salvando…" : "Salvar perfil"}
        </button>
      </form>
    </details>
  );
}
