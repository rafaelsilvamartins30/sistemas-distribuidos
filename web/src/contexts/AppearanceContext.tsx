import { createContext, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from "react";

export type ColorMode = "light" | "dark";
export type ColorPalette = "green" | "blue" | "violet" | "ember";

interface AppearanceSettings {
  mode: ColorMode;
  palette: ColorPalette;
}

interface AppearanceContextValue extends AppearanceSettings {
  setMode: (mode: ColorMode) => void;
  setPalette: (palette: ColorPalette) => void;
}

const storageKey = "unir.appearance";
const keycloakCookieKey = "unir-keycloak-appearance";
const defaults: AppearanceSettings = { mode: "light", palette: "blue" };
const AppearanceContext = createContext<AppearanceContextValue | null>(null);

function readSettings(): AppearanceSettings {
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return defaults;
    const parsed = JSON.parse(stored) as { mode?: unknown; palette?: unknown };
    return {
      mode: parsed.mode === "dark" ? "dark" : "light",
      palette:
        parsed.palette === "green"
          ? "green"
          : parsed.palette === "blue"
            ? "blue"
            : parsed.palette === "violet"
              ? "violet"
              : parsed.palette === "ember" || parsed.palette === "amber"
                ? "ember"
                : "blue",
    };
  } catch {
    return defaults;
  }
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppearanceSettings>(readSettings);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = settings.mode;
    document.documentElement.dataset.palette = settings.palette;
    localStorage.setItem(storageKey, JSON.stringify(settings));
    const secureCookie = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${keycloakCookieKey}=${encodeURIComponent(JSON.stringify(settings))}; Path=/realms/unir/; Max-Age=31536000; SameSite=Lax${secureCookie}`;
  }, [settings]);

  const value = useMemo<AppearanceContextValue>(
    () => ({
      ...settings,
      setMode: (mode) => setSettings((current) => ({ ...current, mode })),
      setPalette: (palette) => setSettings((current) => ({ ...current, palette })),
    }),
    [settings],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance(): AppearanceContextValue {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error("useAppearance precisa ser usado dentro de AppearanceProvider.");
  return value;
}
