import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, ".", "KEYCLOAK_");

  return {
    plugins: [react()],
    server: {
      host: "0.0.0.0",
      port: 15174,
      strictPort: true,
      proxy: {
        "/keycloak-account": {
          target: environment.KEYCLOAK_INTERNAL_URL || "http://localhost:18081",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/keycloak-account/, ""),
        },
      },
    },
  };
});
