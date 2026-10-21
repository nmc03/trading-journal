# Security policy

Trading Journal is a single-user, self-hosted app. It is a personal project, not a commercial product.

## Supported versions

Only the latest version on the `main` branch is supported.

## Scope and limits

- **Single user.** One username and password from `backend/.env`. The app is not built for several users or for hosting by a third party.
- **No built-in TLS.** The API serves plain HTTP. Use it on localhost, your LAN or a VPN. If it is reachable from any untrusted network, put an HTTPS reverse proxy in front of it and set `TRUST_PROXY_HOPS=1`.
- **Token storage.** The login JWT (8-hour expiry) is kept in the browser's `localStorage`. Any script that runs on the page can read it. The app sends a Content Security Policy of `default-src 'self'` to limit this. Use the app only on devices you trust.
- **Brute-force protection.** Login is limited to 10 attempts per 15 minutes per client.

## What operators must do

If you run an instance, you are responsible for:

- keeping `backend/.env` private, with a strong `TJ_PASSWORD` and a random `JWT_SECRET` of at least 32 characters
- using HTTPS, through a reverse proxy, whenever the app is reachable from outside your own network
- protecting the `data/` folder and every backup, since they contain the full journal
- keeping the host operating system, Node.js or Docker, and the reverse proxy up to date
- not exposing the app to the Internet without a proxy that handles TLS

## Reporting a vulnerability

Do not include credentials, private trading data or working exploit details in a public issue.

1. If GitHub private vulnerability reporting is enabled for this repository, use it.
2. Otherwise, open a minimal issue that asks for a private contact channel. Do not describe the problem in the issue.

Reports are handled on a best-effort basis. There is no service-level commitment.
