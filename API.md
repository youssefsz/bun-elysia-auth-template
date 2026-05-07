  # Tricky Genie API

  API base path: `/api/v1`

  ## Conventions

  ### Content type

  Send JSON requests with:

  ```http
  Content-Type: application/json
  ```

  ### Authentication

  Authenticated routes accept either:

  - the session cookie set by the auth endpoints
  - `Authorization: Bearer <session-token>`

  Successful sign-in responses still set the browser cookie and also return a bearer token payload for native mobile clients.

  Session-establishing endpoints:

  - `POST /api/v1/auth/login`
  - `POST /api/v1/auth/providers/google`
  - `POST /api/v1/auth/providers/apple`
  - `POST /api/v1/auth/verify-email/confirm`

  Default cookie name:

  ```text
  tricky_genie_session
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
    "service": "tricky-genie",
    "status": "ok",
    "version": "v1"
  }
  ```

  ## Auth

  ### `POST /api/v1/auth/register`

  Creates or refreshes a pending local email/password registration and sends a verification email.

  Request body:

  ```json
  {
    "email": "user@example.com",
    "name": "Jane Doe",
    "password": "strong-password-123"
  }
  ```

  Success response:

  ```json
  {
    "success": true,
    "verificationEmail": {
      "requestedAt": "2026-04-04T09:00:00.000Z",
      "resendAvailableAt": "2026-04-04T09:01:00.000Z",
      "retryAfterSeconds": 60
    }
  }
  ```

  ### `POST /api/v1/auth/login`

  Signs in with a verified local email/password account.

  Request body:

  ```json
  {
    "email": "user@example.com",
    "password": "strong-password-123"
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
    },
    "session": {
      "token": "jwt-session-token",
      "tokenType": "Bearer",
      "expiresInSeconds": 604800
    }
  }
  ```

  ### `POST /api/v1/auth/verify-email/request`

  Resends a pending verification email when a local registration has not been confirmed yet.

  The response always keeps the same shape, even when the email does not map to a pending registration, so the frontend can show a countdown without leaking account existence.

  Request body:

  ```json
  {
    "email": "user@example.com"
  }
  ```

  Success response:

  ```json
  {
    "success": true,
    "verificationEmail": {
      "requestedAt": "2026-04-04T09:00:00.000Z",
      "resendAvailableAt": "2026-04-04T09:01:00.000Z",
      "retryAfterSeconds": 60
    }
  }
  ```

  ### `POST /api/v1/auth/verify-email/confirm`

  Confirms a verification token and signs the user in.

  This is the endpoint your frontend should call after the user lands on the frontend verification page from the email link.

  Request body:

  ```json
  {
    "token": "verification-token"
  }
  ```

  Success responses:

  ```json
  {
    "status": "verified",
    "user": {
      "id": "user_...",
      "email": "user@example.com",
      "name": "Jane Doe",
      "emailVerified": true,
      "createdAt": "2026-03-10T09:00:00.000Z",
      "updatedAt": "2026-03-10T09:00:00.000Z"
    },
    "session": {
      "token": "jwt-session-token",
      "tokenType": "Bearer",
      "expiresInSeconds": 604800
    }
  }
  ```

  ```json
  {
    "status": "already_verified"
  }
  ```

  ### `GET /api/v1/auth/verify-email?token=...`

  Compatibility endpoint. When `FRONTEND_PUBLIC_URL` is configured, it redirects the browser to the frontend verification route with the same `token` query param. Otherwise it verifies the token directly and signs the user in.

  ### `POST /api/v1/auth/password-reset/request`

  Requests a password reset email for a verified local account.

  The response keeps the same shape even when the email does not map to an account, so the frontend can show countdown UX without leaking account existence.

  Request body:

  ```json
  {
    "email": "user@example.com"
  }
  ```

  Success response:

  ```json
  {
    "success": true,
    "passwordResetEmail": {
      "requestedAt": "2026-04-04T09:00:00.000Z",
      "resendAvailableAt": "2026-04-04T09:01:00.000Z",
      "retryAfterSeconds": 60
    }
  }
  ```

  ### `POST /api/v1/auth/password-reset/confirm`

  Consumes a password reset token, updates the password, and invalidates existing sessions.

  Request body:

  ```json
  {
    "token": "reset-token",
    "password": "new-strong-password-123"
  }
  ```

  Success response:

  ```json
  {
    "success": true
  }
  ```

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
    },
    "session": {
      "token": "jwt-session-token",
      "tokenType": "Bearer",
      "expiresInSeconds": 604800
    }
  }
  ```

  Possible errors:

  - `401 INVALID_GOOGLE_TOKEN`
  - `403 EXTERNAL_EMAIL_NOT_VERIFIED`
  - `503 GOOGLE_AUTH_NOT_CONFIGURED`
  - `400 INVALID_REQUEST`

  ### `POST /api/v1/auth/providers/apple`

  Signs in a user with an Apple identity token and sets the session cookie.

  Request body:

  ```json
  {
    "idToken": "apple-identity-token",
    "name": "Jane Doe"
  }
  ```

  `name` is optional, but native mobile clients should send it on the first successful Apple authorization when Apple provides it.

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
    },
    "session": {
      "token": "jwt-session-token",
      "tokenType": "Bearer",
      "expiresInSeconds": 604800
    }
  }
  ```

  Possible errors:

  - `401 INVALID_APPLE_TOKEN`
  - `403 EXTERNAL_EMAIL_NOT_VERIFIED`
  - `503 APPLE_AUTH_NOT_CONFIGURED`
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
          "provider": "email",
          "enabled": true
        },
        {
          "provider": "google",
          "enabled": true
        },
        {
          "provider": "apple",
          "enabled": true
        }
      ],
      "linked": [
        {
          "provider": "email",
          "connectedAt": "2026-03-10T09:00:00.000Z"
        },
        {
          "provider": "google",
          "connectedAt": "2026-03-11T09:00:00.000Z"
        },
        {
          "provider": "apple",
          "connectedAt": "2026-03-12T09:00:00.000Z"
        }
      ]
    }
  }
  ```

  ### `POST /api/v1/auth/logout`

  Browser clients should call this to clear the session cookie. Native mobile clients should delete the bearer token locally. Use `POST /api/v1/auth/logout-all` when you need server-side revocation.

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

  ## Genie

  ### `POST /api/v1/genie/chat`

  Creates a single genie turn using the backend-controlled prompt and the server-side AI provider credentials.

  This route requires:

  - an authenticated session cookie or bearer token

  Request body:

  ```json
  {
    "conversationId": "conversation-1",
    "inputText": "I wish for endless money.",
    "remainingWishes": 3,
    "history": [
      {
        "id": "turn-1",
        "kind": "chat",
        "inputText": "Please explain the rules first.",
        "pose": "idle",
        "result": "continue",
        "speech": "Three wishes. One careless phrase is all I need.",
        "consequence": "No wish was counted.",
        "summary": "The genie explains the rules.",
        "playerCanContinue": true,
        "consumesWish": false
      }
    ]
  }
  ```

  Success response:

  ```json
  {
    "kind": "wish",
    "pose": "laughing",
    "result": "continue",
    "speech": "You asked carefully, but not carefully enough.",
    "consequence": "The wish backfires in a technically valid way.",
    "summary": "The genie spots a loophole.",
    "playerCanContinue": true,
    "consumesWish": true
  }
  ```

  Notes:

  - The backend decides whether the turn is `wish` or `chat` by inspecting `inputText`.
  - The backend is the source of truth for prompt construction, model selection, and AI credentials.
  - The client should continue storing conversation history locally and send the current turn context on each request.

  Possible errors:

  - `401 UNAUTHORIZED`
  - `400 INVALID_REQUEST`
  - `502 GENIE_UPSTREAM_ERROR`
  - `502 GENIE_INVALID_RESPONSE`
  - `503 GENIE_PROVIDER_NOT_CONFIGURED`
