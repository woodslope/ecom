import { describe, expect, it } from "vitest";

import viteConfig from "../vite.config.ts?raw";
import workflow from "../.github/workflows/deploy-pages.yml?raw";
import adr from "../docs/adr/0002-github-pages-local-first-runtime.md?raw";

describe("GitHub Pages runtime contract", () => {
  it("keeps local root serving while allowing a Pages base path", () => {
    expect(viteConfig).toContain('base: env.VITE_BASE_PATH ?? "/"');
    expect(viteConfig).toContain('loadEnv(mode, ".", "")');
    expect(viteConfig).not.toContain("server.proxy");
  });

  it("builds and deploys a static artifact with the repository base path", () => {
    expect(workflow).toContain("VITE_BASE_PATH: /${{ github.event.repository.name }}/");
    expect(workflow).toContain("pnpm build");
    expect(workflow).toContain("actions/upload-pages-artifact@v3");
    expect(workflow).toContain("actions/deploy-pages@v4");
  });

  it("records the no-required-backend and local-job boundary", () => {
    expect(adr).toContain("without a required application server");
    expect(adr).toContain("ExecutionJob");
    expect(adr).toContain("does not promise execution after the page or browser is closed");
  });
});
