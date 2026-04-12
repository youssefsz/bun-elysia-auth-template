# Tricky Genie API

[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![Bun](https://img.shields.io/badge/runtime-Bun-000000?logo=bun)](https://bun.sh/)
[![Elysia](https://img.shields.io/badge/framework-Elysia-1f2937)](https://elysiajs.com/)
[![TypeScript](https://img.shields.io/badge/language-TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/database-PostgreSQL-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Drizzle ORM](https://img.shields.io/badge/orm-Drizzle%20ORM-C5F74F?logo=drizzle&logoColor=black)](https://orm.drizzle.team/)

Production-minded authentication, billing, and account backend for the Tricky Genie app, built with Bun and Elysia. It includes local email and password auth, Google sign-in, Apple sign-in, Apple auto-renewable subscription verification and notification handling, centralized entitlements, a protected genie chat endpoint, JWT-backed sessions for cookies and bearer tokens, email verification, password reset flows, rate limiting, and PostgreSQL persistence with Drizzle ORM.

This codebase is the backend foundation for Tricky Genie and is meant to evolve with the app instead of staying branded as a generic starter project.

## Features

- Email and password registration and login
- Google and Apple sign-in with verified-email-only account linking
- Apple subscription verification with the official App Store Server Library
- App Store Server Notifications V2 handling with idempotent event processing
- Centralized entitlement projection for premium features such as `genie.chat`
- Frontend-first email verification flow
- Frontend-first password reset flow
- JWT-backed sessions usable through HTTP-only cookies or `Authorization: Bearer`
- Multi-provider account linking for the same user
- Account profile read, update, and delete endpoints
- Protected genie chat endpoint behind auth plus entitlement checks
- Server-side OpenRouter integration with backend-controlled genie prompts
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
- [Sign in with Apple](https://developer.apple.com/sign-in-with-apple/) for Apple authentication
- [Resend](https://resend.com/) for transactional auth emails

## What You Get

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/verify-email/request`
- `POST /api/v1/auth/verify-email/confirm`
- `POST /api/v1/auth/password-reset/request`
- `POST /api/v1/auth/password-reset/confirm`
- `POST /api/v1/auth/providers/google`
- `POST /api/v1/auth/providers/apple`
- `GET /api/v1/auth/session`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/logout-all`
- `GET /api/v1/account`
- `PATCH /api/v1/account`
- `DELETE /api/v1/account`
- `GET /api/v1/billing/entitlements`
- `POST /api/v1/billing/apple/subscriptions/sync`
- `POST /api/v1/billing/apple/notifications`
- `POST /api/v1/genie/chat`

Full request and response examples are documented in [API.md](./API.md).

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) installed locally
- PostgreSQL if you want persistent storage
- A Google OAuth client if you want Google sign-in
- Apple App IDs or Services IDs if you want Apple sign-in
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
| `GOOGLE_CLIENT_IDS` | Yes for Google auth | Comma-separated allowlist of Google OAuth client IDs allowed to mint ID tokens for Tricky Genie. `GOOGLE_CLIENT_ID` is still accepted as a legacy fallback |
| `APPLE_CLIENT_IDS` | Yes for Apple auth | Comma-separated allowlist of Apple client IDs this backend accepts in the `aud` claim. For native mobile apps this is typically your app bundle identifiers. `APPLE_CLIENT_ID` is still accepted as a legacy fallback |
| `APPLE_APP_STORE_BUNDLE_ID` | Yes for Apple billing | The app bundle identifier used for StoreKit subscriptions and App Store Server verification |
| `APPLE_APP_STORE_APP_ID` | Required for production Apple billing verification | Numeric App Store app ID used by the production signed-data verifier |
| `APPLE_APP_STORE_ISSUER_ID` | Yes for Apple billing | App Store Connect issuer ID for the In-App Purchase key |
| `APPLE_APP_STORE_KEY_ID` | Yes for Apple billing | App Store Connect In-App Purchase key ID |
| `APPLE_APP_STORE_PRIVATE_KEY` | Yes for Apple billing | PEM private key content for the App Store Server API |
| `APPLE_ROOT_CA_PATHS` | Yes for Apple billing | Comma-separated paths to the Apple root certificate files used by the signed-data verifier |
| `APPLE_SUBSCRIPTION_PRODUCTS` | Yes for Apple billing | JSON array that maps App Store product IDs to plan keys and feature keys, for example `genie.chat` |
| `RESEND_API_KEY` | Yes for auth emails | Resend API key |
| `RESEND_FROM_EMAIL` | Yes for auth emails | Sender address for transactional emails |
| `OPENROUTER_API_KEY` | Yes for genie AI | Server-side API key used for `POST /api/v1/genie/chat` |
| `OPENROUTER_MODEL_ID` | No | OpenRouter model identifier. Defaults to `openai/gpt-4o-mini` |
| `OPENROUTER_SITE_URL` | No | Optional `HTTP-Referer` header value sent to OpenRouter |
| `OPENROUTER_APP_NAME` | No | Optional `X-Title` header value sent to OpenRouter |
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
  core/         Auth, billing, database, and email infrastructure
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
- Google and Apple accounts are only linked automatically when the provider reports the email as verified
- `POST /api/v1/auth/verify-email/confirm` is the source of truth for token redemption and sign-in
- Auth success responses include a bearer token payload for native mobile clients while still setting the browser session cookie
- Google sign-in should allowlist only Tricky Genie's own client IDs, such as your iOS, Android, and web/server IDs
- Apple sign-in should allowlist only Tricky Genie's own Apple client IDs, and the mobile app should forward the one-time Apple display name when Apple provides it on first sign-in
- Apple billing uses StoreKit 2 signed transactions plus App Store Server API and App Store Server Notifications V2; the backend stays the source of truth for premium access
- The Swift app should request the backend entitlement payload first and reuse the returned `appAccountToken` when starting StoreKit purchases
- Premium access is projected into centralized entitlements; `POST /api/v1/genie/chat` only runs after auth and entitlement checks pass
- `POST /api/v1/genie/chat` now expects a turn-based payload from the client; the backend owns wish/chat detection, prompt construction, model calls, and structured response validation
- Automatic account linking only happens when the normalized email string matches across providers; if a user chooses Apple's private relay email, that relay address is treated as a distinct email unless it exactly matches another login method
- `POST /api/v1/auth/logout` clears the local browser cookie; native apps should discard the bearer token locally, or call `POST /api/v1/auth/logout-all` to revoke all active sessions server-side
- `POST /api/v1/auth/password-reset/confirm` invalidates existing sessions after a successful password change
- Sensitive cookie-backed browser writes reject cross-site `Origin` and `Referer` headers
- Auth emails require an explicit `APP_PUBLIC_URL` or `FRONTEND_PUBLIC_URL`; the server no longer derives public links from request headers

## Project Notes

This backend powers Tricky Genie. Keep the product URLs, email sender details, and Google and Apple client IDs aligned with the client app as the product evolves.

## Author

Created and maintained by [Youssef Dhibi](https://dhibi.tn).

GitHub: [@youssefsz](https://github.com/youssefsz)

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE) for details.
