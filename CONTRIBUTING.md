# Contributing

Trading Journal is a personal project, not a commercial product. Focused pull requests are welcome.

## Setup

Requirements: Node.js 24 and npm. Docker is only needed to test the full stack.

Backend (terminal 1):

```bash
cd backend
cp .env.example .env     # then edit the values
npm ci
DATA_DIR=../data node --env-file=.env server.js
```

`DATA_DIR` keeps the database in the repository's `data/` folder, which Git ignores. Without it the server uses `/app/data`, the Docker path. On Windows PowerShell, run `$env:DATA_DIR = "../data"` first. Pass it on the command line and do not add it to `backend/.env`: Docker reads that file too.

Frontend (terminal 2):

```bash
cd frontend
npm ci
npm run dev
```

Vite serves the UI on `http://localhost:5173` and proxies `/api` to `http://localhost:3001`.

## Tests and checks

```bash
# Backend
cd backend
npm test
npm run check
npm audit --omit=dev --audit-level=high

# Frontend
cd frontend
npm test
npm run build
npm audit --audit-level=high
```

If you change `docker-compose.yml`, the root `Dockerfile` or `docker-entrypoint.sh`, also run the Docker check. It needs `backend/.env` to exist:

```bash
docker compose config
docker compose build
```

Pure calculation logic lives in `frontend/src/lib/calc.js`. Add or update tests in `calc.test.js` when you change metrics or CSV export.

## Branches and pull requests

- Do not commit directly to `main`.
- Create a branch for each change and open a pull request.
- CI must pass before you merge. CI runs the backend and frontend checks, validates the Compose file and builds the Docker image.
- Keep one concern per pull request.

## Code style

- Match the code around your change: naming, formatting and file layout.
- Write code comments in English.
- Put UI text in the locale files under `frontend/src/lib/locales/`. Do not hard-code text in components.
- Do not add dependencies unless they are needed. Explain new ones in the pull request.
- Put colours and spacing in the CSS variables in `frontend/src/styles.css`. Avoid inline styles.

Design decisions are in `design/AUDIT.md` and `design/TOKENS.md`.

## Adding a language

See the [Languages section of the README](README.md#languages). In short: add `frontend/src/lib/locales/xx.js`, add the API messages to `backend/i18n.js`, register the language in `frontend/src/lib/i18n.js`, then run `npm test` in `backend/` and `frontend/`.

## Regenerating screenshots and demo GIFs

The screenshots and demo GIFs (one set per language) use synthetic demo data only.

1. Use a throwaway data folder, not your real journal. `seed-demo.js` adds trades to the running instance.
2. Start the backend with a known `TJ_USER` and `TJ_PASSWORD` in `backend/.env`, using a separate `DATA_DIR`.
3. Seed the demo data from `backend/`:

   ```bash
   cd backend
   TJ_URL=http://localhost:3001 TJ_USER=... TJ_PASSWORD=... node scripts/seed-demo.js
   ```

4. In another terminal, start the frontend dev server: `npm run dev` in `frontend/`.
5. Install the capture tools in `backend/` without saving them to `package.json`:

   ```bash
   cd backend
   npm i --no-save playwright-core gifenc pngjs
   ```

6. Capture the media. The script needs a local Chrome. Set `CHROME_PATH` if Chrome is not in the default location. The default path is for Windows.

   ```bash
   cd backend
   TJ_USER=... TJ_PASSWORD=... node scripts/shots.cjs
   ```

   To capture only some languages, set `SHOT_LANGS=es,en`. The script reads `TJ_APP_URL` (default `http://localhost:5173`) and `TJ_API_URL` (default `http://localhost:3001`).

Output goes to `docs/screenshots/<lang>/` and `docs/demo-<lang>.gif`. Check every image before you commit it. It must not show real account data.

## Privacy in issues and pull requests

Do not include in commits, issues, pull requests or screenshots:

- real trading data or account details
- `.env` files, JWT secrets or passwords
- SQLite databases (`*.db`, `*.sqlite`) or `data/` folders
- screenshots that show real data

Use synthetic examples instead.

## Pull request checklist

- [ ] The change is scoped to one concern and described in the pull request.
- [ ] `npm test` and `npm run check` pass in `backend/`.
- [ ] `npm test` and `npm run build` pass in `frontend/`.
- [ ] Docker files were checked if they changed.
- [ ] README and CHANGELOG are updated if behaviour changed.
- [ ] No credentials, `.env` files, databases or real trading data are included.

## Security

Report security issues as described in [SECURITY.md](SECURITY.md). Do not publish exploit details in a normal issue or pull request.
