# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [2.0.1] - 2026-10-25

### Added

- The CI now runs a Docker smoke test (`scripts/docker-smoke.sh`): it builds the image, starts it with throwaway credentials and checks the UI, localised API errors, login, persistence across a restart and that the server does not run as root.
- A GitHub release is created automatically from this changelog when a version tag (`vX.Y.Z`) is pushed.

### Changed

- Documentation rewritten for clarity and accuracy: README (in five languages), CONTRIBUTING, SECURITY and PRIVACY. The Node.js quick start now passes `DATA_DIR` and `STATIC_DIR` on the command line so the same `backend/.env` also works with Docker.

### Fixed

- Docker image: the server could not read its own files when the image was built with a restrictive `umask` (for example 077): the unprivileged `node` user got `permission denied` on `package.json`. File modes are now set explicitly in the `Dockerfile`.

### Security

- Dependency locks refreshed to patch a vulnerable IPv6 address parser in a transitive dependency.

## [2.0.0] - 2026-10-21

### Upgrading from 1.x

- Docker now runs a single container (service `app`) that serves the UI itself; nginx and the separate frontend container are gone. Rebuild with `docker compose up -d --build` and remove the old `frontend` service/images if you had them.
- `TRUST_PROXY_HOPS` now defaults to `0`. If you serve the app behind a reverse proxy, set it to `1`.
- The port is published directly from the app (`${HTTP_PORT:-8080}:3001`). The app has no built-in HTTPS: put a reverse proxy in front of it if it is reachable from an untrusted network.
- New optional `STATIC_DIR` variable to serve a built frontend without Docker.
- API validation errors now come back in the language of the `Accept-Language` header (Spanish by default) and no longer expose field identifiers such as `entryPrice`.

### Added

- Multi-language support (es, en, fr, de, pt) for the UI, API error messages (chosen by `Accept-Language`) and READMEs, with automatic language detection and a language selector in the header and on the login screen.
- Tab and history filters live in the URL (`#/historial?q=NVDA&estado=abiertas`): back/forward and reload keep your place.
- Animated demo walkthrough (`docs/demo.gif`) in the README, built from synthetic demo data.
- Dark theme (ink), following the system `prefers-color-scheme` setting.
- Skip link to the main content, and a `theme-color` meta tag.
- Profit factor in the review metrics.
- Max drawdown, calculated from the cumulative P&L curve.
- Cumulative P&L (equity) curve.
- Plan-discipline statistics: results grouped by whether the trading plan was followed.
- History filters: text search and an open/closed filter.
- CSV export of trades, with protection against spreadsheet formula injection.
- CSV import of files exported by the app, and JSON export.
- Accessibility: input labels, `aria-pressed` toggles and keyboard-operable trade cards; hint when the stop is on the profit side; favicon.
- Delete confirmation before a trade is removed.
- Public documentation: `PRIVACY.md`, this changelog, issue and pull request templates, and README screenshots built from synthetic demo data (`docs/screenshots/`).

### Changed

- Docker image verified end to end on a Linux server (build, healthcheck, API, CSP, data persistence across restarts).
- Full visual redesign: light graph-paper theme, design tokens as CSS variables, equity curve as the dashboard hero, rows instead of cards, and no emojis.
- Numbers and dates use es-ES formatting.
- Login is a real form.
- Pure trade calculations moved into `frontend/src/lib/calc.js` so they can be unit tested without React.
- Errors are shown in an in-page error banner instead of `alert()`.
- README, CONTRIBUTING and SECURITY rewritten for the current feature set, deployment and privacy model.
- Docker deployment is a single container: nginx and the separate frontend container were removed. The Express API serves the built UI.
- `TRUST_PROXY_HOPS` now defaults to `0`. Set it to `1` only behind an HTTPS reverse proxy.
- New optional `STATIC_DIR` variable sets the path to the built frontend (defaults to `backend/public`).
- Node.js is documented as the primary way to run the app; Docker is optional.

### Fixed

- Mobile (390 px): the header no longer overflows horizontally; the tabs get their own row and the exchange-rate and sign-out controls stay in view.
- Save/validation errors stay visible (sticky banner) when the form is scrolled.
- The empty new-trade form no longer shows a stray "NaN".
- Exchange rate: invalid values (0, out of range, text) now show an inline error in the dialog instead of closing silently; the header label uses the same direction as the field (1 EUR = x USD).
- Prices in lists use es-ES formatting (`15,1 €`) like the rest of the interface.
- Keyboard and zoom: the "Skip to content" link no longer resets the tab (it was overwriting the URL hash) and moves focus to the content; the exchange-rate dialog closes with Esc and keeps focus inside; the login button stays enabled and explains missing fields; the two-row header now applies up to 720 px so nothing overflows at 200 % zoom.
- "Import CSV" is a real button now: Tab reaches it and Enter/Space opens the file picker (a hidden input behind a label was skipped by the keyboard).
- Switching section now starts at the top of the page and clears the previous section's error notice; the sticky header is opaque so scrolled content no longer shows through it.
- The "invalid CSV" message tells you to use a file exported from the app and names the missing columns with their on-screen label.
- Error messages use the visible Spanish field names (no more `fxRate` / `entryPrice`) and a friendly message when the server is unreachable.
- Critical `proxy-addr` advisory (IP spoofing via trust proxy) resolved by updating the backend lockfile.
- Test cleanup on Windows in the backend test suite.

### Tests

- Unit tests for the calculation module (`frontend/src/lib/calc.js`).
- Extended backend tests for authentication, input validation and error paths.

[Unreleased]: https://github.com/nmc03/trading-journal/compare/v2.0.1...HEAD
[2.0.1]: https://github.com/nmc03/trading-journal/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/nmc03/trading-journal/releases/tag/v2.0.0
