(() => {
  const storageKey = "unir.keycloakAppearance";
  const accentByPalette = {
    green: "#16745e",
    blue: "#3468b1",
    violet: "#7853a6",
    ember: "#c24132",
    amber: "#c24132",
  };

  function isAppearance(value) {
    return (
      value &&
      (value.mode === "light" || value.mode === "dark") &&
      Object.prototype.hasOwnProperty.call(accentByPalette, value.palette)
    );
  }

  function readAppearance() {
    try {
      const cookie = document.cookie
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith("unir-keycloak-appearance="));
      const fromCookie = cookie
        ? JSON.parse(decodeURIComponent(cookie.slice("unir-keycloak-appearance=".length)))
        : null;

      if (isAppearance(fromCookie)) {
        sessionStorage.setItem(storageKey, JSON.stringify(fromCookie));
        return fromCookie;
      }

      const saved = sessionStorage.getItem(storageKey);
      const parsed = saved ? JSON.parse(saved) : null;
      return isAppearance(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  const appearance = readAppearance();
  if (!appearance) return;

  const root = document.documentElement;
  root.dataset.unirMode = appearance.mode;
  const palette = appearance.palette === "amber" ? "ember" : appearance.palette;
  root.dataset.unirPalette = palette;
  root.classList.toggle("pf-v5-theme-dark", appearance.mode === "dark");

  const accent = accentByPalette[palette];
  const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="17" fill="${accent}"/><path d="M16 19v19c0 9 6 15 16 15s16-6 16-15V19" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/><circle cx="16" cy="15" r="5" fill="#fff"/><circle cx="48" cy="15" r="5" fill="#fff"/><circle cx="32" cy="36" r="5" fill="#fff"/></svg>`;
  const logoUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(logoSvg)}`;

  function updateLogo() {
    document.querySelectorAll('img[src*="unir-logo.svg"]').forEach((image) => {
      image.src = logoUrl;
    });
  }

  updateLogo();
  new MutationObserver(updateLogo).observe(document.documentElement, { childList: true, subtree: true });
})();
