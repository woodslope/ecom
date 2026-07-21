# ADR 0002: GitHub Pages And Local-First Runtime

- Status: Accepted
- Date: 2026-07-21
- Decision owners: Ecom product and implementation

## Decision

Ecom remains a static React/Vite application that can be built and served from GitHub Pages without a required application server.

- GitHub Actions builds `dist` and deploys it to the repository Pages site.
- Vite receives `VITE_BASE_PATH` so local development uses `/` and project Pages use `/<repository>/`.
- Product facts, assets, editable sessions, production runs, and local execution jobs remain browser-local.
- User-configured Provider APIs are called directly from the browser and must support HTTPS and CORS.
- API keys are never committed, embedded in the build, or written to repository artifacts.

## Execution boundary

`ExecutionJob` represents a resumable local operation such as planning, generation, translation, or batch work. It can pause, cancel, retry, and recover after a page refresh while the browser is available. It does not promise execution after the page or browser is closed.

An eventual server-backed worker may implement the same job contract, but it is not required by the current product and must not leak server assumptions into the static runtime.

## Consequences

- No Next.js server routes, SQLite/Prisma database, Electron runtime, or mandatory proxy is introduced for the GitHub Pages build.
- Provider availability, CORS, quotas, and browser storage limits remain explicit external risks.
- Background-task UX is implemented as a local queue first; true process-independent execution is a later deployment option.
