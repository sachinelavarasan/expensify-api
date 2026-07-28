# Expensify API

Backend API for the [Expensify](../expensify) app — a NestJS service handling authentication, transactions, budgets, recurring transactions, notifications, and reporting.

## 🛠 Tech stack

- **NestJS** (Express) + TypeScript
- **PostgreSQL** via **Drizzle ORM**
- **JWT** access/refresh auth (custom, not a third-party auth provider)
- **Nodemailer** for OTP emails (signup verification, password reset)
- **Firebase Admin** for profile image storage
- **Expo Server SDK** for push notifications
- **@nestjs/schedule** for cron jobs, **@nestjs/throttler** for rate limiting
- **Swagger / OpenAPI** for API docs

## 🚀 Getting started

```bash
npm install
```

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

| Variable | Purpose |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Postgres connection |
| `PORT` | Server port (defaults to `3000` if unset) |
| `EXPENSIFY_JWT_ACCESS_SECRET`, `EXPENSIFY_JWT_REFRESH_SECRET`, `EXPENSIFY_JWT_ACCESS_EXPIRY`, `EXPENSIFY_JWT_REFRESH_EXPIRY` | JWT auth |
| `SMTP_*` | Nodemailer config for OTP emails |
| `FIREBASE_STORAGE_SERVICE_ACCOUNT_KEY`, `FIREBASE_STORAGE_BUCKET` | Profile image storage (separate Firebase project) |
| `EXPENSIFY_EXPO_PUSH_NOTIFICATION_ACCESS_TOKEN` | Expo push notifications |
| `CRON_SECRET_TOKEN` | Auth token for external callers (e.g. GitHub Actions) hitting `/crons/*` |
| `NOTIFICATION_TEST_TOKEN` | Auth token for the dev-only `/notifications/test-send` route |

Run database migrations, then start the server:

```bash
npm run migration:run
npm run start:dev
```

The API listens on `http://localhost:<PORT>` (default `3000`; local dev commonly uses `8000` — check your `.env`).

## 📖 API docs

Interactive Swagger UI is served at **`/api/docs`** (raw OpenAPI JSON at `/api/docs-json`) once the server is running.

`GET /` renders a small branded status page (for browsers); `GET /health` returns the same status as JSON for uptime checks/monitoring.

## 📂 Project structure

- `src/modules/expensify/` — core domain: transactions, accounts, categories, budgets, recurring transactions, auth (`auth/`)
- `src/database/` — Drizzle schemas, repositories, migrations, migration scripts
- `src/mail/` — OTP email templates + `MailService` (Nodemailer)
- `src/notification/` — push notifications (Expo Server SDK)
- `src/cronjobs/` — scheduled jobs (e.g. recurring transactions)
- `src/storage/` — Firebase-backed file storage (profile images)
- `src/common/` — shared middleware, guards, etc.

## 🧪 Scripts

```bash
npm run start:dev       # dev server with watch mode
npm run build            # production build
npm run start:prod       # run compiled build
npm run test:unit        # unit tests
npm run test:cov         # tests with coverage
npm run lint              # eslint --fix
npm run check-types      # tsc --noEmit
npm run migration:generate  # generate a Drizzle migration
npm run migration:push      # push schema changes directly (dev)
npm run migration:run       # run pending migrations
```
