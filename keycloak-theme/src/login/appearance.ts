const storageKey = "unir.keycloakAppearance";
const accentByPalette: Record<string, string> = {
  green: "#16745e",
  blue: "#3468b1",
  violet: "#7853a6",
  ember: "#c24132",
  amber: "#c24132",
};

interface KeycloakAppearance {
  mode: "light" | "dark";
  palette: string;
}

function isAppearance(value: unknown): value is KeycloakAppearance {
  if (!value || typeof value !== "object") return false;
  const appearance = value as Partial<KeycloakAppearance>;
  return (
    (appearance.mode === "light" || appearance.mode === "dark") &&
    typeof appearance.palette === "string" &&
    Object.prototype.hasOwnProperty.call(accentByPalette, appearance.palette)
  );
}

export function applyKeycloakAppearance(): void {
  let appearance: KeycloakAppearance | null = null;

  try {
    const cookie = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("unir-keycloak-appearance="));
    const fromCookie: unknown = cookie
      ? JSON.parse(decodeURIComponent(cookie.slice("unir-keycloak-appearance=".length)))
      : null;

    if (isAppearance(fromCookie)) {
      appearance = fromCookie;
      sessionStorage.setItem(storageKey, JSON.stringify(appearance));
    } else {
      const stored = sessionStorage.getItem(storageKey);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (isAppearance(parsed)) appearance = parsed;
      }
    }
  } catch {
    appearance = null;
  }

  if (!appearance) return;
  const root = document.documentElement;
  root.dataset.unirMode = appearance.mode;
  const palette = appearance.palette === "amber" ? "ember" : appearance.palette;
  root.dataset.unirPalette = palette;

  const accent = accentByPalette[palette];
  const logo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="17" fill="${accent}"/><path d="M16 19v19c0 9 6 15 16 15s16-6 16-15V19" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/><circle cx="16" cy="15" r="5" fill="#fff"/><circle cx="48" cy="15" r="5" fill="#fff"/><circle cx="32" cy="36" r="5" fill="#fff"/></svg>`;
  root.style.setProperty("--unir-brand-mark", `url("data:image/svg+xml,${encodeURIComponent(logo)}")`);
}
