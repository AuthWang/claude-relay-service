# Repository Guidelines

## Project Structure & Module Organization
- `src/` hosts the Express app (`app.js`) with feature folders: `routes/` for HTTP surface, `services/` for provider logic, plus `models/`, `middleware/`, `utils/`, and `validators/`.
- Operational tooling lives in `cli/`, `src/cli/`, `lib/ops/` (consumed by `ops.js`), and curated scripts under `scripts/` for migrations, pricing, and diagnostics.
- Frontend assets reside in `web/admin-spa/` (source) and `web/dist/` (build); configs and env samples stay in `config/` and `.env.example`, while `data/`, `resources/`, `uploads/`, and `logs/` store runtime artifacts.

## Build, Test, and Development Commands
- `npm run setup` prepares config scaffolding; use after pulling env-sensitive changes.
- `npm run dev` starts nodemon; `npm start` lints then runs `src/app.js` for production parity.
- `npm test` executes Jest; `npm run lint` or `npm run lint:check` enforce ESLint/Prettier; `npm run format(:check)` handles formatting.
- `npm run build:web` compiles the SPA, while `npm run service:start|status` and `npm run ops:start|status|logs` wrap the service managers; `npm run status:detail` prints health diagnostics.

## Coding Style & Naming Conventions
- Target Node >=18 with CommonJS exports; avoid mixing module systems.
- Prettier enforces 2-space indentation, single quotes, no semicolons, and 100-char lines; run `npm run format` before committing.
- Follow lowerCamelCase file names (`openaiRoutes.js`, `accountGroupService.js`), `PascalCase` classes, and SCREAMING_SNAKE_CASE env vars.
- Keep validations near their features and prefer expressive function names over comments; update shared utilities in `src/utils/` when logic becomes cross-cutting.

## Testing Guidelines
- `npm test` runs Jest, which discovers `*.test.js`/`*.spec.js`; colocate unit specs next to the source or mirror ops checks under `scripts/`.
- Stub external providers (Anthropic, OpenAI, Redis) and include coverage notes for scheduler or relay changes.
- For manual probes, follow existing harnesses such as `node scripts/test-model-mapping.js` and document the command in your PR.

## Commit & Pull Request Guidelines
- Use Conventional Commit prefixes (`feat`, `fix`, `chore`, `docs`) as shown in history; keep subject lines imperative and concise.
- Detail rationale and impact in the body, including config files touched or migrations required; bilingual notes are welcome when paired with an English summary.
- PRs must link issues (`Closes #123`), list executed commands (`npm test`, `npm run lint`), and attach screenshots/logs for UI or ops changes.

## Configuration & Security Tips
- Never commit real secrets; derive `.env` from `.env.example` and align `config/config.js` with `config/config.example.js`.
- Manage processes through `scripts/manage.js` or `lib/ops/ServiceManager.js` so init checks (e.g., `data/init.json`) stay enforced; review rate limits when adding routes.
- The `ops` launcher first probes local Redis, then spins up Docker with `redis_data/` mounted, and auto-seeds admin credentials from `data/init.json`; install Docker if neither environment exists.
