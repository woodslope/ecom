import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  return {
    // GitHub Pages serves project sites below /<repository>/; local preview stays at /.
    base: env.VITE_BASE_PATH ?? "/",
    plugins: [react()],
    test: {
      environment: "node",
      include: ["tests/**/*.test.ts"],
    },
  };
});
