# API Documentation

API base path: `/api/v1`

## Conventions

### Content type

Send JSON requests with:

```http
Content-Type: application/json
```

### Authentication

Authenticated routes use a session cookie set by `POST /api/v1/auth/providers/google`.

Default cookie name:

```text
auth_template_session
```

### Error format

All handled errors return this shape:

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Invalid input."
  }
}
```

## Health

### `GET /health`

```json
{
  "status": "ok"
}
```

### `GET /`

```json
{
  "service": "elysia-auth-template",
  "status": "ok",
  "version": "v1"
}
```

## Auth

### `POST /api/v1/auth/providers/google`

Signs in a user with a Google ID token and sets the session cookie.

Request body:

```json
{
  "idToken": "google-id-token"
}
```

Success response:

```json
{
  "user": {
    "id": "user_...",
    "email": "user@example.com",
    "name": "Jane Doe",
    "emailVerified": true,
    "createdAt": "2026-03-10T09:00:00.000Z",
    "updatedAt": "2026-03-10T09:00:00.000Z"
  }
}
```

Possible errors:

- `401 INVALID_GOOGLE_TOKEN`
- `503 GOOGLE_AUTH_NOT_CONFIGURED`
- `400 INVALID_REQUEST`

### `GET /api/v1/auth/session`

```json
{
  "authenticated": true,
  "user": {
    "id": "user_...",
    "email": "user@example.com",
    "name": "Jane Doe",
    "emailVerified": true,
    "createdAt": "2026-03-10T09:00:00.000Z",
    "updatedAt": "2026-03-10T09:00:00.000Z"
  }
}
```

When not authenticated:

```json
{
  "authenticated": false,
  "user": null
}
```

### `GET /api/v1/auth/providers`

Returns linked providers and currently available provider metadata for the authenticated user.

```json
{
  "providers": {
    "available": [
      {
        "provider": "google",
        "enabled": true
      }
    ],
    "linked": [
      {
        "provider": "google",
        "connectedAt": "2026-03-10T09:00:00.000Z"
      }
    ]
  }
}
```

### `POST /api/v1/auth/logout`

```json
{
  "success": true
}
```

### `POST /api/v1/auth/logout-all`

Invalidates all sessions for the current user and clears the browser cookie.

```json
{
  "success": true
}
```

## Account

### `GET /api/v1/account`

```json
{
  "account": {
    "id": "user_...",
    "email": "user@example.com",
    "name": "Jane Doe",
    "emailVerified": true,
    "createdAt": "2026-03-10T09:00:00.000Z",
    "updatedAt": "2026-03-10T09:00:00.000Z"
  }
}
```

### `PATCH /api/v1/account`

Request body:

```json
{
  "name": "Jane Doe"
}
```

### `DELETE /api/v1/account`

Request body:

```json
{
  "confirmEmail": "user@example.com"
}
```

Success response:

```json
{
  "success": true
}
```

Possible errors:

- `401 UNAUTHORIZED`
- `400 EMAIL_CONFIRMATION_MISMATCH`
