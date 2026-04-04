# Elysia Auth Template

Reusable Bun + Elysia backend starter for multi-provider authentication with session cookies, local email/password login, Google sign-in, and verified-email account linking.

## Features

- Email/password registration and login
- Email verification powered by Resend
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
| `GOOGLE_CLIENT_ID` | Yes for Google auth | Validates Google ID tokens |
| `RESEND_API_KEY` | Yes for local signup | Authenticates verification email delivery |
| `RESEND_FROM_EMAIL` | Yes for local signup | Sender address used for verification emails |
| `RESEND_FROM_NAME` | No | Sender display name |
| `EMAIL_VERIFICATION_TTL_SECONDS` | No | Verification token lifetime |
| `SESSION_SECRET` | Yes | HMAC secret for signed session tokens |
| `SESSION_ISSUER` | No | JWT issuer and audience |
| `SESSION_COOKIE_NAME` | No | Browser session cookie name |
| `SESSION_COOKIE_SAME_SITE` | No | Session cookie SameSite policy |
| `SESSION_TTL_SECONDS` | No | Session lifetime |
| `CORS_ORIGINS` | Yes in production | Allowed browser origins for `/api` routes |
| `TRUST_PROXY_HEADERS` | No | Trust proxy forwarding headers for rate limiting and public verification links |
| `MAX_REQUEST_BODY_SIZE_BYTES` | No | Global request body limit |
| `RATE_LIMIT_AUTH_PER_MINUTE` | No | Registration, login, verification, and logout rate limit |
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
- `POST /api/v1/auth/providers/google`
- `GET /api/v1/auth/session`
- `GET /api/v1/auth/providers`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/logout-all`
- `GET /api/v1/account`
- `PATCH /api/v1/account`
- `DELETE /api/v1/account`

Full request and response examples live in `API.md`.

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
