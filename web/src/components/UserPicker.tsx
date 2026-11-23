import { useEffect, useMemo, useState } from "react";
import { searchCampusUsers, type DirectoryUser } from "../services/campus";

interface UserPickerProps {
  token: string;
  selectedUserIds: string[];
  onChange: (nextUserIds: string[]) => void;
  label?: string;
  helperText?: string;
}

function userTypeLabel(userType: string): string {
  switch (userType) {
    case "PROFESSOR":
      return "Docente";
    case "STUDENT":
      return "Estudante";
    case "ALUMNI":
      return "Egresso";
    default:
      return userType || "Usuário";
  }
}

export function UserPicker({
  token,
  selectedUserIds,
  onChange,
  label = "Administradores",
  helperText = "Busque pelo nome ou matrícula para adicionar ou remover administradores.",
}: UserPickerProps) {
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    async function loadDirectory() {
      setLoading(true);
      try {
        const res = await searchCampusUsers(token);
        if (active) setDirectory(res.items ?? []);
      } catch {
        if (active) setDirectory([]);
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadDirectory();
    return () => {
      active = false;
    };
  }, [token]);

  const userByKeycloakId = useMemo(() => {
    const map = new Map<string, DirectoryUser>();
    for (const user of directory) {
      map.set(user.keycloakUserId, user);
    }
    return map;
  }, [directory]);

  const filteredCandidates = useMemo(() => {
    const selectedSet = new Set(selectedUserIds);
    const normalized = query.trim().toLowerCase();
    return directory
      .filter((user) => !selectedSet.has(user.keycloakUserId))
      .filter((user) => {
        if (!normalized) return true;
        return (
          user.name.toLowerCase().includes(normalized) ||
          user.registrationCode.toLowerCase().includes(normalized) ||
          user.userType.toLowerCase().includes(normalized)
        );
      })
      .slice(0, 8);
  }, [directory, query, selectedUserIds]);

  function addUser(keycloakUserId: string) {
    if (selectedUserIds.includes(keycloakUserId)) return;
    onChange([...selectedUserIds, keycloakUserId]);
    setQuery("");
  }

  function removeUser(keycloakUserId: string) {
    onChange(selectedUserIds.filter((id) => id !== keycloakUserId));
  }

  return (
    <div className="sports-field" style={{ display: "grid", gap: "0.55rem" }}>
      <span>{label}</span>

      {/* Selecionados como chips com Nome e Matrícula — ZERO UUID na tela */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
        {selectedUserIds.length === 0 && <span className="sports-match-meta">Nenhum administrador selecionado.</span>}
        {selectedUserIds.map((uid) => {
          const user = userByKeycloakId.get(uid);
          return (
            <span
              key={uid}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.45rem",
                padding: "0.35rem 0.65rem",
                borderRadius: "999px",
                background: "var(--accent-soft, rgba(59,130,246,0.12))",
                color: "var(--accent-strong, #1d4ed8)",
                fontSize: "0.85rem",
                fontWeight: 600,
              }}
            >
              <span>
                {user
                  ? `${user.name} · ${user.registrationCode} (${userTypeLabel(user.userType)})`
                  : loading
                    ? "Carregando usuário…"
                    : "Usuário vinculado"}
              </span>
              {selectedUserIds.length > 1 && (
                <button
                  type="button"
                  aria-label={`Remover ${user?.name ?? "administrador"}`}
                  onClick={() => removeUser(uid)}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "inherit",
                    cursor: "pointer",
                    fontWeight: 800,
                    padding: "0 2px",
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              )}
            </span>
          );
        })}
      </div>

      {/* Campo de busca por nome ou matrícula */}
      <input
        type="search"
        placeholder={loading ? "Carregando usuários da UFLA…" : "Buscar pessoa por nome ou matrícula para adicionar…"}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      {!loading && filteredCandidates.length > 0 && (
        <div
          style={{
            display: "grid",
            gap: "0.3rem",
            maxHeight: "170px",
            overflowY: "auto",
            padding: "0.45rem",
            borderRadius: "10px",
            border: "1px solid var(--border)",
            background: "var(--surface-muted)",
          }}
        >
          {filteredCandidates.map((user) => (
            <div
              key={user.keycloakUserId}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.5rem",
                padding: "0.4rem 0.6rem",
                borderRadius: "8px",
                background: "var(--surface)",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <strong style={{ display: "block", fontSize: "0.88rem" }}>{user.name}</strong>
                <small style={{ color: "var(--muted)", fontSize: "0.78rem" }}>
                  Matrícula {user.registrationCode} · {userTypeLabel(user.userType)}
                </small>
              </div>
              <button
                type="button"
                className="button button-secondary"
                style={{ minHeight: "30px", padding: "0 10px", fontSize: "0.8rem" }}
                onClick={() => addUser(user.keycloakUserId)}
              >
                + Adicionar
              </button>
            </div>
          ))}
        </div>
      )}

      {!loading && query.trim() && filteredCandidates.length === 0 && (
        <small style={{ color: "var(--muted)" }}>Nenhum usuário encontrado com “{query.trim()}”.</small>
      )}

      <small style={{ color: "var(--muted)", fontWeight: 400 }}>{helperText}</small>
    </div>
  );
}
