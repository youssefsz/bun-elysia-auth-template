# Elysia Auth Template

Reusable Bun + Elysia backend starter for multi-provider authentication with session cookies, local email/password login, frontend-first email verification and password reset, Google sign-in, and verified-email account linking.

## Features

- Email/password registration and login
- Email verification and password reset powered by Resend
- Google sign-in with verified-email-only auto-linking
- One user account linked to multiple providers
- Signed session cookies backed by JWTs
- Account profile endpoints
- Logout current session and invalidate all sessions
- PostgreSQL persistence with Drizzle ORM
- In-memory repository fallback when `DATABASE_URL` is not set
- Structured logging, standardized error responses, and request rate limiting

## Stack

- Bun
- Elysia
- TypeScript
- PostgreSQL
- Drizzle ORM
- jose
- Resend Email API

## Quick Start

```bash
bun install
cp .env.example .env
bun run db:migrate
bun run dev
```

The server runs on `http://localhost:3000` by default.

## Environment Variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV` | No | Runtime environment |
| `PORT` | No | HTTP server port |
| `DATABASE_URL` | No | PostgreSQL connection string |
| `APP_PUBLIC_URL` | Recommended | Trusted public backend origin used for fallback links and redirects |
| `FRONTEND_PUBLIC_URL` | Recommended | Public frontend origin used in auth emails |
| `AUTH_EMAIL_RESEND_COOLDOWN_SECONDS` | No | Minimum wait before sending another verification or reset email to the same address |
| `AUTH_EMAIL_MAX_PER_HOUR` | No | Per-email auth email cap over 1 hour |
| `AUTH_EMAIL_MAX_PER_DAY` | No | Per-email auth email cap over 24 hours |
| `EMAIL_VERIFICATION_FRONTEND_PATH` | No | Frontend route that receives verification tokens |
| `PASSWORD_RESET_FRONTEND_PATH` | No | Frontend route that receives password reset tokens |
| `GOOGLE_CLIENT_ID` | Yes for Google auth | Validates Google ID tokens |
| `RESEND_API_KEY` | Yes for local signup | Authenticates verification email delivery |
| `RESEND_FROM_EMAIL` | Yes for local signup | Sender address used for verification emails |
| `RESEND_FROM_NAME` | No | Sender display name |
| `EMAIL_VERIFICATION_TTL_SECONDS` | No | Verification token lifetime |
| `PASSWORD_RESET_TTL_SECONDS` | No | Password reset token lifetime |
| `SESSION_SECRET` | Yes | HMAC secret for signed session tokens |
| `SESSION_ISSUER` | No | JWT issuer and audience |
| `SESSION_COOKIE_NAME` | No | Browser session cookie name |
| `SESSION_COOKIE_SAME_SITE` | No | Session cookie SameSite policy |
| `SESSION_TTL_SECONDS` | No | Session lifetime |
| `CORS_ORIGINS` | Yes in production | Allowed browser origins for `/api` routes |
| `TRUST_PROXY_HEADERS` | No | Trust proxy forwarding headers for rate limiting when no trusted public URL is configured |
| `MAX_REQUEST_BODY_SIZE_BYTES` | No | Global request body limit |
| `RATE_LIMIT_AUTH_PER_MINUTE` | No | Registration, login, verification, and logout rate limit |
| `RATE_LIMIT_AUTH_EMAIL_PER_MINUTE` | No | IP-based auth email request rate limit |
| `RATE_LIMIT_ACCOUNT_PER_MINUTE` | No | Authenticated account route rate limit |

## API Surface

- `GET /`
- `GET /health`
- `GET /api`
- `GET /api/v1`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/verify-email/request`
- `POST /api/v1/auth/verify-email/confirm`
- `GET /api/v1/auth/verify-email`
- `POST /api/v1/auth/password-reset/request`
- `POST /api/v1/auth/password-reset/confirm`
- `POST /api/v1/auth/providers/google`
- `GET /api/v1/auth/session`
- `GET /api/v1/auth/providers`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/logout-all`
- `GET /api/v1/account`
- `PATCH /api/v1/account`
- `DELETE /api/v1/account`

Full request and response examples live in `API.md`.

## Auth Email UX

- Verification emails prefer `FRONTEND_PUBLIC_URL + EMAIL_VERIFICATION_FRONTEND_PATH`, so users land in your app UI first.
- Password reset emails prefer `FRONTEND_PUBLIC_URL + PASSWORD_RESET_FRONTEND_PATH`.
- `POST /api/v1/auth/verify-email/confirm` is the backend source of truth for redeeming verification tokens and setting the session cookie.
- `GET /api/v1/auth/verify-email` becomes a compatibility redirect to the frontend verification route when `FRONTEND_PUBLIC_URL` is configured.
- `POST /api/v1/auth/register`, `POST /api/v1/auth/verify-email/request`, and `POST /api/v1/auth/password-reset/request` return frontend-friendly retry metadata with `requestedAt`, `resendAvailableAt`, and `retryAfterSeconds`.
- Verification is idempotent: the first valid token confirmation returns `verified`, and repeated confirmations return `already_verified`.
- Auth email cooldowns and hourly/daily caps are persisted per email and shared across verification and password reset flows by kind, so the frontend can show countdowns without leaking whether an account exists.

## Provider Linking

- Google sign-in only links to an existing account when Google reports the email as verified.
- Local email/password accounts become linkable once the verification email is confirmed.
- After linking, the same user can sign in with either provider and lands on the same account.

## Development

```bash
bun run dev
bun run start
bun run typecheck
bun run test
```
