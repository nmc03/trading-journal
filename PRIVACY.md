# Privacy

Trading Journal is self-hosted software. The person or organisation that runs an instance controls its data. The project maintainers do not receive, host or see any journal data.

## What is stored

On the server, in SQLite:

- **Trades:** date, ticker, currency, direction, entry, exit and stop/target prices, position size, commissions, time in position, expected duration, setup type, entry reason, whether the plan was followed, notes and lessons, and the creation time.
- **Settings:** the EUR/USD rate you configure.

The login username and password come from `backend/.env`. The server hashes the password with bcrypt when it starts. The hash is kept in memory and is not written to the database.

## Where it is stored

- **Server:** the journal is in `data/trading.db` (SQLite, in the `data/` folder). Docker uses `./data` in the project folder. Node.js uses the folder set in `DATA_DIR`. The data stays on the machine that runs the app.
- **Browser:** the login token (JWT, valid for 8 hours) is stored in `localStorage` under the key `tj_token`. The language choice is stored under `tj_lang`. Anyone with access to the browser profile can read these values, so use a device you trust.

## What is not collected

- No telemetry, analytics or crash reporting.
- No cookies.
- No requests to third parties. The Content Security Policy is `default-src 'self'`, so the browser loads resources only from the app's own origin.
- No data sent to the project maintainers or to any other service.

## Exporting your data

In the History tab you can download:

- a CSV file of your trades
- a JSON file with the trades and the EUR/USD rate

You can also import a CSV file exported by the app.

## Deleting your data

To delete everything:

1. Stop the app: `docker compose stop app`, or stop the Node.js process.
2. Delete the `data/` folder. On Windows, delete the `data` folder in the project folder.
3. Delete `backend/.env` if you no longer need its credentials.
4. Delete every backup you made, including copies in cloud storage or on other machines.
5. In the browser where you used the app, clear the site data for the app's address, or remove `tj_token` and `tj_lang` from `localStorage`.

To delete one trade, open it in the History tab and confirm the deletion.

## Backups

Backups are copies of `data/`. They contain the full journal, so protect them as you would the original. The person who runs the instance is responsible for making, storing and protecting backups. See the [README](README.md#backups-restore-and-updating) for backup and restore steps.

## Your responsibilities

Because the data stays on your own infrastructure:

- protect `backend/.env`, the `data/` folder and any backups
- use HTTPS if the app is reachable from outside your own network
- keep the host operating system, Node.js or Docker, and any reverse proxy up to date

For vulnerability reports, see [SECURITY.md](SECURITY.md).

## Demo media

The screenshots and demo GIFs in this repository use synthetic demo data only.
