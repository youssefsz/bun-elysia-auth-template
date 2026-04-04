# Elysia Auth Template

[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![Bun](https://img.shields.io/badge/runtime-Bun-000000?logo=bun)](https://bun.sh/)
[![Elysia](https://img.shields.io/badge/framework-Elysia-1f2937)](https://elysiajs.com/)
[![TypeScript](https://img.shields.io/badge/language-TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/database-PostgreSQL-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Drizzle ORM](https://img.shields.io/badge/orm-Drizzle%20ORM-C5F74F?logo=drizzle&logoColor=black)](https://orm.drizzle.team/)

Production-minded authentication backend template built with Bun and Elysia. It includes local email and password auth, Google sign-in, JWT-backed session cookies, email verification, password reset flows, rate limiting, and PostgreSQL persistence with Drizzle ORM.

This template is designed to be a clean starting point for open source and commercial projects that need a solid authentication foundation.

## Features

- Email and password registration and login
- Google sign-in with verified-email-only account linking
- Frontend-first email verification flow
- Frontend-first password reset flow
- Signed HTTP-only session cookies backed by JWTs
- Multi-provider account linking for the same user
- Account profile read, update, and delete endpoints
- Logout and logout-all session invalidation support
- PostgreSQL persistence with Drizzle ORM migrations
- In-memory fallback when `DATABASE_URL` is not configured
- Structured error responses, rate limiting, and request logging

## Technologies Used

- [Bun](https://bun.sh/) for runtime, package management, and testing
- [Elysia](https://elysiajs.com/) for the HTTP API framework
- [TypeScript](https://www.typescriptlang.org/) for type-safe application code
- [PostgreSQL](https://www.postgresql.org/) for persistent storage
- [Drizzle ORM](https://orm.drizzle.team/) and Drizzle Kit for schema management and migrations
- [Zod](https://zod.dev/) for request validation
- [jose](https://github.com/panva/jose) for JWT signing and verification
- [Google Identity](https://developers.google.com/identity) for Google authentication
- [Resend](https://resend.com/) for transactional auth emails

## What You Get

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/verify-email/request`
- `POST /api/v1/auth/verify-email/confirm`
- `POST /api/v1/auth/password-reset/request`
- `POST /api/v1/auth/password-reset/confirm`
- `POST /api/v1/auth/providers/google`
- `GET /api/v1/auth/session`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/logout-all`
- `GET /api/v1/account`
- `PATCH /api/v1/account`
- `DELETE /api/v1/account`

Full request and response examples are documented in [API.md](./API.md).

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) installed locally
- PostgreSQL if you want persistent storage
- A Google OAuth client if you want Google sign-in
- A [Resend](https://resend.com/) account if you want email verification and password reset emails

### Installation

```bash
bun install
cp .env.example .env
```

Update `.env` with the values you need for your environment.

### Run Database Migrations

```bash
bun run db:migrate
```

### Start the Development Server

```bash
bun run dev
```

The API runs on `http://localhost:3000` by default.

## Available Scripts

| Command | Description |
| --- | --- |
| `bun run dev` | Start the app in watch mode |
| `bun run start` | Start the app once |
| `bun run test` | Run the test suite |
| `bun run typecheck` | Run TypeScript type checking |
| `bun run db:generate` | Generate Drizzle migrations |
| `bun run db:migrate` | Apply database migrations |

## Configuration

Use [.env.example](./.env.example) as the source of truth for local configuration. The most important variables are listed below.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | No | PostgreSQL connection string. If omitted, the app falls back to in-memory repositories |
| `SESSION_SECRET` | Yes | Secret used to sign session tokens. In production it must be unique and at least 32 characters long |
| `CORS_ORIGINS` | Yes for browser clients | Exact allowed browser origins for `/api` routes. Wildcards are intentionally rejected |
| `APP_PUBLIC_URL` | Yes unless `FRONTEND_PUBLIC_URL` is set | Public backend URL used for redirects and backend-hosted verification links |
| `FRONTEND_PUBLIC_URL` | Recommended | Frontend URL used in verification and reset email links |
| `GOOGLE_CLIENT_ID` | Yes for Google auth | Google OAuth client ID used to validate ID tokens |
| `RESEND_API_KEY` | Yes for auth emails | Resend API key |
| `RESEND_FROM_EMAIL` | Yes for auth emails | Sender address for transactional emails |
| `EMAIL_VERIFICATION_FRONTEND_PATH` | No | Frontend route for email verification |
| `PASSWORD_RESET_FRONTEND_PATH` | No | Frontend route for password reset |
| `SESSION_COOKIE_NAME` | No | Browser session cookie name |
| `SESSION_COOKIE_SAME_SITE` | No | SameSite policy for the auth cookie. Defaults to `lax` |
| `SESSION_TTL_SECONDS` | No | Session lifetime in seconds |
| `RATE_LIMIT_AUTH_PER_MINUTE` | No | Rate limit for auth endpoints |
| `RATE_LIMIT_AUTH_EMAIL_PER_MINUTE` | No | Rate limit for auth email requests |
| `RATE_LIMIT_ACCOUNT_PER_MINUTE` | No | Rate limit for authenticated account routes |

## Project Structure

```text
src/
  api/          Route definitions
  config/       Environment and runtime configuration
  core/         Auth, database, and email infrastructure
  db/           Schema and migration files
  domains/      Shared domain types
  middleware/   Auth and security middleware
  schemas/      Request validation schemas
  services/     Business logic
  utils/        Shared utilities
```

## Authentication Notes

- Local sign-up sends a verification email before activating the account
- Password reset links are intended to land in your frontend first
- Google accounts are only linked automatically when Google reports the email as verified
- `POST /api/v1/auth/verify-email/confirm` is the source of truth for token redemption and sign-in
- `POST /api/v1/auth/password-reset/confirm` invalidates existing sessions after a successful password change
- Sensitive cookie-backed browser writes reject cross-site `Origin` and `Referer` headers
- Auth emails require an explicit `APP_PUBLIC_URL` or `FRONTEND_PUBLIC_URL`; the server no longer derives public links from request headers

## Open Source

Issues and pull requests are welcome. If you use this template in your own project, feel free to fork it, adapt it, and build on top of it.

## Author

Created and maintained by [Youssef Dhibi](https://dhibi.tn).

GitHub: [@youssefsz](https://github.com/youssefsz)

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE) for details.
