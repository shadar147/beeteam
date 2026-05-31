# BeeTeam Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add authentication (argon2 password + JWT) and the authed `(app)` shell (Sidebar + Topbar) to BeeTeam, with sessions carried in an httpOnly cookie set by a Next.js proxy — proven end-to-end: log in as the seeded lead, see the shell, log out.

**Architecture:** axum exposes `POST /v1/auth/login` (argon2 verify → HS256 JWT) and `GET /v1/auth/me` (behind a `require_auth` middleware). The browser never calls axum directly: Next.js route handlers proxy to axum, store the JWT in an httpOnly cookie, and forward it as a Bearer header. `middleware.ts` redirects unauthenticated `(app)` routes to `/login`.

**Tech Stack:** Rust (axum 0.7, jsonwebtoken, argon2, sqlx), Next.js 14 App Router (route handlers, middleware, server components), TanStack Query, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-05-31-beeteam-auth-design.md`. This is build-order slice 2 of the Core 1-2-1 parent spec. Foundation (slice 1) is merged to `main`.

> **Conventions carried from Foundation (do not relearn the hard way):**
> - Toolchains are NOT on the default PATH. Run cargo/node/pnpm via a **login shell**: `bash -lc '...'`.
> - Run Rust tests via `api/scripts/test.sh [args]` (loads `.env`, points `#[sqlx::test]` at the ephemeral test DB on :5433). Bring it up once: `docker compose up -d postgres-test`.
> - The brand amber is the `brand` Tailwind token (`bg-brand`, `text-brand-strong`, `bg-brand-soft`, `text-brand-text`), NOT `accent` (shadcn reserves `accent`).
> - Foundation uses runtime sqlx queries (`sqlx::query`/`query_as`), no compile-time `query_as!` — keep that style.
> - Commit `web/lib/api/schema.d.ts` (generated, it's the typed contract) and `api/Cargo.lock`.

---

## File Structure

**Backend (`api/`):**
```
api/Cargo.toml                          # workspace deps: add argon2, jsonwebtoken (+ axum "macros" feature)
api/crates/bt-domain/src/lib.rs         # + LoginRequest, UserDto, LoginResponse, Claims
api/crates/bt-db/Cargo.toml             # + argon2 dep (seed hashes demo1234)
api/crates/bt-db/src/seed.rs            # replace "!seed-no-login" with argon2 hash of demo1234
api/crates/bt-api/Cargo.toml            # + argon2, jsonwebtoken; axum macros
api/crates/bt-api/src/auth/mod.rs       # pub mod password; pub mod jwt; pub mod middleware;
api/crates/bt-api/src/auth/password.rs  # hash_password / verify_password (Argon2id)
api/crates/bt-api/src/auth/jwt.rs       # encode_jwt / decode_jwt (HS256), Claims
api/crates/bt-api/src/auth/middleware.rs# require_auth layer + AuthUser extractor
api/crates/bt-api/src/routes/auth.rs    # login + me handlers
api/crates/bt-api/src/routes/mod.rs     # + pub mod auth;
api/crates/bt-api/src/app.rs            # mount auth routes; require_auth on /v1/auth/me; CORS → WEB_ORIGIN
api/crates/bt-api/src/openapi.rs        # register auth paths + schemas
api/crates/bt-api/src/main.rs           # + mod auth; read JWT_SECRET, WEB_ORIGIN; pass to AppState
```

**Frontend (`web/`):**
```
web/lib/api/schema.d.ts                 # regenerated (gen:api) — adds /v1/auth/login, /v1/auth/me
web/lib/auth.ts                         # cookie name const + server-side getSessionUser() helper
web/app/api/auth/login/route.ts         # POST: proxy → axum, set bt_session cookie
web/app/api/auth/logout/route.ts        # POST: clear bt_session cookie
web/app/api/v1/[...path]/route.ts       # catch-all proxy: cookie → Bearer → axum
web/middleware.ts                       # redirect unauthed (app) → /login; authed /login → /
web/components/Logo.tsx                  # B mark + wordmark
web/components/Avatar.tsx                # oklch hue → bg/text, initials
web/components/NavItem.tsx              # icon + label + count + active state
web/components/Sidebar.tsx              # 232px nav + user card + logout
web/components/Topbar.tsx               # 60px breadcrumbs + stub actions
web/app/login/page.tsx                  # LoginScreen (split layout)
web/app/login/LoginForm.tsx             # client form (submit → /api/auth/login)
web/app/(app)/layout.tsx                # server component: getSessionUser → Sidebar+Topbar shell
web/app/(app)/page.tsx                  # "Моя команда" placeholder
web/app/page.tsx                        # DELETE (health probe replaced by login flow)
web/components/__tests__/Avatar.test.tsx
web/components/__tests__/NavItem.test.tsx
web/app/login/__tests__/LoginForm.test.tsx
web/e2e/auth.spec.ts                     # full login→shell→logout + wrong-password
```

---

## Task 1: Backend — argon2 password hashing

**Files:**
- Modify: `api/Cargo.toml` (workspace deps)
- Modify: `api/crates/bt-api/Cargo.toml`
- Create: `api/crates/bt-api/src/auth/mod.rs`
- Create: `api/crates/bt-api/src/auth/password.rs`
- Modify: `api/crates/bt-api/src/main.rs` (add `mod auth;`)

- [ ] **Step 1: Add argon2 + jsonwebtoken to workspace deps** (`api/Cargo.toml`, under `[workspace.dependencies]`, after the `dotenvy` line):

```toml
argon2 = "0.5"
jsonwebtoken = "9"
```

Also enable axum's `macros` feature (needed for `middleware::from_fn` ergonomics and `debug_handler`). Change the `axum` line to:

```toml
axum = { version = "0.7", features = ["macros"] }
```

- [ ] **Step 2: Add deps to `bt-api`** (`api/crates/bt-api/Cargo.toml`, in `[dependencies]` after `anyhow = "1"`):

```toml
argon2 = { workspace = true }
jsonwebtoken = { workspace = true }
uuid = { workspace = true }
chrono = { workspace = true }
```

- [ ] **Step 3: Create the auth module file** (`api/crates/bt-api/src/auth/mod.rs`):

```rust
pub mod jwt;
pub mod middleware;
pub mod password;
```

- [ ] **Step 4: Write the failing test + implementation** (`api/crates/bt-api/src/auth/password.rs`):

```rust
use argon2::password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;

/// Hash a plaintext password with Argon2id. Returns the PHC string.
pub fn hash_password(plain: &str) -> Result<String, argon2::password_hash::Error> {
    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default().hash_password(plain.as_bytes(), &salt)?;
    Ok(hash.to_string())
}

/// Verify a plaintext password against a stored PHC hash. False on any mismatch.
pub fn verify_password(plain: &str, phc: &str) -> bool {
    match PasswordHash::new(phc) {
        Ok(parsed) => Argon2::default()
            .verify_password(plain.as_bytes(), &parsed)
            .is_ok(),
        Err(_) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_then_verify_round_trips() {
        let phc = hash_password("demo1234").unwrap();
        assert!(verify_password("demo1234", &phc));
    }

    #[test]
    fn verify_rejects_wrong_password() {
        let phc = hash_password("demo1234").unwrap();
        assert!(!verify_password("wrong", &phc));
    }

    #[test]
    fn verify_rejects_garbage_hash() {
        assert!(!verify_password("demo1234", "not-a-phc-string"));
    }
}
```

- [ ] **Step 5: Register the module** (`api/crates/bt-api/src/main.rs`) — add `mod auth;` after `mod app;`:

```rust
mod app;
mod auth;
mod error;
mod openapi;
mod routes;
```

- [ ] **Step 6: Run the tests** (no DB needed):

Run: `bash -lc 'cd /Users/lebedev.v/projects/beeteam/api && cargo test -p bt-api password'`
Expected: `hash_then_verify_round_trips`, `verify_rejects_wrong_password`, `verify_rejects_garbage_hash` all pass.

- [ ] **Step 7: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add api/Cargo.toml api/Cargo.lock api/crates/bt-api/Cargo.toml api/crates/bt-api/src/auth api/crates/bt-api/src/main.rs
git commit -m "feat(api): argon2 password hashing util"
```

---

## Task 2: Backend — JWT encode/decode

**Files:**
- Modify: `api/crates/bt-domain/src/lib.rs` (add `Claims`)
- Create: `api/crates/bt-api/src/auth/jwt.rs`

- [ ] **Step 1: Add `Claims` to `bt-domain`** (`api/crates/bt-domain/src/lib.rs`, append after the `Health` impl, before `#[cfg(test)]`):

```rust
/// JWT claims for an authenticated session.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Claims {
    pub sub: uuid::Uuid, // user id
    pub role: String,
    pub exp: i64, // unix seconds
}
```

Add the `uuid` import at the top of the file (after the existing `use` lines):

```rust
use uuid::Uuid as _Uuid; // ensure uuid is linked; Claims uses uuid::Uuid path
```

> Note: `bt-domain/Cargo.toml` already depends on `uuid` and `chrono` (from Foundation), so no manifest change is needed. If the `use` alias trips an "unused import" warning, instead write the field as `pub sub: uuid::Uuid,` (fully-qualified, which it already is) and DROP the alias line — the `uuid` crate is referenced by path so it links without a `use`. Prefer dropping the alias.

- [ ] **Step 2: Write the failing test + implementation** (`api/crates/bt-api/src/auth/jwt.rs`):

```rust
use bt_domain::Claims;
use chrono::Utc;
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};

const TOKEN_TTL_SECS: i64 = 7 * 24 * 60 * 60; // 7 days

/// Build a 7-day HS256 token for a user.
pub fn encode_jwt(sub: uuid::Uuid, role: &str, secret: &str) -> Result<String, jsonwebtoken::errors::Error> {
    let claims = Claims {
        sub,
        role: role.to_string(),
        exp: Utc::now().timestamp() + TOKEN_TTL_SECS,
    };
    encode(&Header::default(), &claims, &EncodingKey::from_secret(secret.as_bytes()))
}

/// Validate a token and return its claims. Errors on bad signature or expiry.
pub fn decode_jwt(token: &str, secret: &str) -> Result<Claims, jsonwebtoken::errors::Error> {
    let data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )?;
    Ok(data.claims)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encode_then_decode_round_trips() {
        let id = uuid::Uuid::new_v4();
        let token = encode_jwt(id, "lead", "test-secret").unwrap();
        let claims = decode_jwt(&token, "test-secret").unwrap();
        assert_eq!(claims.sub, id);
        assert_eq!(claims.role, "lead");
        assert!(claims.exp > Utc::now().timestamp());
    }

    #[test]
    fn decode_rejects_wrong_secret() {
        let token = encode_jwt(uuid::Uuid::new_v4(), "lead", "secret-a").unwrap();
        assert!(decode_jwt(&token, "secret-b").is_err());
    }
}
```

- [ ] **Step 3: Run the tests**

Run: `bash -lc 'cd /Users/lebedev.v/projects/beeteam/api && cargo test -p bt-api jwt'`
Expected: `encode_then_decode_round_trips`, `decode_rejects_wrong_secret` pass. (If `bt-domain` emits an unused-import warning for the alias, remove the alias line per Step 1's note and re-run.)

- [ ] **Step 4: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add api/crates/bt-domain/src/lib.rs api/crates/bt-api/src/auth/jwt.rs
git commit -m "feat(api): JWT encode/decode (HS256, 7-day TTL) + Claims type"
```

---

## Task 3: Backend — auth DTOs + login/me handlers

**Files:**
- Modify: `api/crates/bt-domain/src/lib.rs` (DTOs)
- Create: `api/crates/bt-api/src/routes/auth.rs`
- Modify: `api/crates/bt-api/src/routes/mod.rs`
- Modify: `api/crates/bt-api/src/app.rs` (state + routes)
- Modify: `api/crates/bt-api/src/main.rs` (read JWT_SECRET)

This task wires `login` (public) but mounts `me` in Task 4 (after the middleware exists). Login is testable now via `oneshot`.

- [ ] **Step 1: Add DTOs to `bt-domain`** (`api/crates/bt-domain/src/lib.rs`, append after `Claims`):

```rust
/// Login request body.
#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

/// Public user shape returned to the client.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema, PartialEq)]
pub struct UserDto {
    pub id: uuid::Uuid,
    pub name: String,
    pub email: String,
    pub role: String,
}

/// Successful login payload.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct LoginResponse {
    pub token: String,
    pub user: UserDto,
}
```

- [ ] **Step 2: Extend `AppState` with the JWT secret** (`api/crates/bt-api/src/app.rs`). Replace the `AppState` struct and `build_router` signature region (lines 13–31) with:

```rust
#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub jwt_secret: String,
}

/// Build the application router. Pure function of state — used by tests too.
pub fn build_router(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        .route("/v1/health", get(routes::health::health))
        .route("/v1/auth/login", axum::routing::post(routes::auth::login))
        .route("/api-docs/openapi.json", get(openapi_json))
        .layer(TraceLayer::new_for_http())
        .layer(cors)
        .with_state(state)
}
```

(CORS stays `Any` until Task 6, which tightens it to `WEB_ORIGIN`. The `/v1/auth/me` route is added in Task 4.)

- [ ] **Step 3: Write the login handler** (`api/crates/bt-api/src/routes/auth.rs`):

```rust
use axum::extract::State;
use axum::Json;
use bt_domain::{LoginRequest, LoginResponse, UserDto};

use crate::app::AppState;
use crate::auth::{jwt, password};
use crate::error::{AppError, AppResult};

#[utoipa::path(
    post,
    path = "/v1/auth/login",
    request_body = LoginRequest,
    responses(
        (status = 200, description = "Authenticated", body = LoginResponse),
        (status = 401, description = "Invalid credentials"),
    )
)]
pub async fn login(
    State(state): State<AppState>,
    Json(body): Json<LoginRequest>,
) -> AppResult<Json<LoginResponse>> {
    // Fetch user by email. Identical 401 whether the email is unknown or the
    // password is wrong (no account enumeration).
    let row: Option<(uuid::Uuid, String, String, String, String)> = sqlx::query_as(
        "SELECT id, name, email, role::text, password_hash FROM users WHERE email = $1",
    )
    .bind(&body.email)
    .fetch_optional(&state.pool)
    .await?;

    let (id, name, email, role, hash) = row.ok_or(AppError::Unauthorized)?;

    if !password::verify_password(&body.password, &hash) {
        return Err(AppError::Unauthorized);
    }

    let token = jwt::encode_jwt(id, &role, &state.jwt_secret)
        .map_err(|_| AppError::Unauthorized)?;

    Ok(Json(LoginResponse {
        token,
        user: UserDto { id, name, email, role },
    }))
}
```

- [ ] **Step 4: Register the routes module** (`api/crates/bt-api/src/routes/mod.rs`):

```rust
pub mod auth;
pub mod health;
```

- [ ] **Step 5: Read `JWT_SECRET` in main** (`api/crates/bt-api/src/main.rs`). After the `let bind = ...` line, add:

```rust
    let jwt_secret = std::env::var("JWT_SECRET").unwrap_or_else(|_| "dev-only-change-me".into());
```

And change the `build_router(AppState { pool })` line to:

```rust
    let router = build_router(AppState { pool, jwt_secret });
```

- [ ] **Step 5b: Fix the Foundation health-handler test for the new field** (`api/crates/bt-api/src/routes/health.rs`). The existing test constructs `AppState { pool }`, which no longer compiles. Change it to:

```rust
        let router = build_router(AppState { pool, jwt_secret: "test-secret".into() });
```

(Task 6 adds `web_origin` to this same construction.)

- [ ] **Step 6: Write the login handler tests** (`api/crates/bt-api/src/routes/auth.rs`, append). These seed a user directly so the test is independent of the demo seed:

```rust
#[cfg(test)]
mod tests {
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    use crate::app::{build_router, AppState};
    use crate::auth::password::hash_password;

    async fn seed_one_user(pool: &sqlx::PgPool) {
        let ws: (uuid::Uuid,) =
            sqlx::query_as("INSERT INTO workspaces (name) VALUES ('T') RETURNING id")
                .fetch_one(pool).await.unwrap();
        let hash = hash_password("demo1234").unwrap();
        sqlx::query(
            "INSERT INTO users (workspace_id, email, password_hash, name, role, hue) \
             VALUES ($1, 'lead@x.io', $2, 'Lead X', 'lead'::user_role, 40)",
        )
        .bind(ws.0).bind(hash).execute(pool).await.unwrap();
    }

    fn app(pool: sqlx::PgPool) -> axum::Router {
        build_router(AppState { pool, jwt_secret: "test-secret".into() })
    }

    async fn post_login(pool: sqlx::PgPool, body: &str) -> (StatusCode, serde_json::Value) {
        let resp = app(pool)
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/v1/auth/login")
                    .header("content-type", "application/json")
                    .body(Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        let status = resp.status();
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        let json = serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null);
        (status, json)
    }

    #[sqlx::test]
    async fn login_succeeds_with_correct_password(pool: sqlx::PgPool) {
        seed_one_user(&pool).await;
        let (status, json) =
            post_login(pool, r#"{"email":"lead@x.io","password":"demo1234"}"#).await;
        assert_eq!(status, StatusCode::OK);
        assert!(json["token"].as_str().unwrap().len() > 10);
        assert_eq!(json["user"]["email"], "lead@x.io");
        assert_eq!(json["user"]["role"], "lead");
    }

    #[sqlx::test]
    async fn login_rejects_wrong_password(pool: sqlx::PgPool) {
        seed_one_user(&pool).await;
        let (status, _) =
            post_login(pool, r#"{"email":"lead@x.io","password":"nope"}"#).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
    }

    #[sqlx::test]
    async fn login_rejects_unknown_email(pool: sqlx::PgPool) {
        let (status, _) =
            post_login(pool, r#"{"email":"ghost@x.io","password":"demo1234"}"#).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
    }
}
```

- [ ] **Step 7: Run the tests** (DB required):

Run: `bash -lc 'cd /Users/lebedev.v/projects/beeteam && docker compose up -d postgres-test >/dev/null && ./api/scripts/test.sh -p bt-api auth'`
Expected: `login_succeeds_with_correct_password`, `login_rejects_wrong_password`, `login_rejects_unknown_email` pass (plus the existing password/jwt unit tests).

- [ ] **Step 8: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add api/crates/bt-domain/src/lib.rs api/crates/bt-api/src/routes api/crates/bt-api/src/app.rs api/crates/bt-api/src/main.rs api/Cargo.lock
git commit -m "feat(api): POST /v1/auth/login (argon2 verify -> JWT)"
```

---

## Task 4: Backend — require_auth middleware + /v1/auth/me

**Files:**
- Create: `api/crates/bt-api/src/auth/middleware.rs`
- Modify: `api/crates/bt-api/src/routes/auth.rs` (add `me` handler)
- Modify: `api/crates/bt-api/src/app.rs` (mount `me` behind middleware)

- [ ] **Step 1: Write the middleware** (`api/crates/bt-api/src/auth/middleware.rs`):

```rust
use axum::extract::State;
use axum::http::Request;
use axum::middleware::Next;
use axum::response::Response;

use crate::app::AppState;
use crate::auth::jwt;
use crate::error::AppError;

/// Authenticated principal, inserted into request extensions by `require_auth`.
#[derive(Debug, Clone)]
pub struct AuthUser {
    pub id: uuid::Uuid,
    pub role: String,
}

/// Axum middleware: require a valid `Authorization: Bearer <jwt>` header.
pub async fn require_auth(
    State(state): State<AppState>,
    mut req: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, AppError> {
    let token = req
        .headers()
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "))
        .ok_or(AppError::Unauthorized)?;

    let claims = jwt::decode_jwt(token, &state.jwt_secret).map_err(|_| AppError::Unauthorized)?;

    req.extensions_mut().insert(AuthUser {
        id: claims.sub,
        role: claims.role,
    });

    Ok(next.run(req).await)
}
```

- [ ] **Step 2: Add the `me` handler** (`api/crates/bt-api/src/routes/auth.rs`, append before the `#[cfg(test)]` block). It reads `AuthUser` from extensions and loads the user row:

```rust
use axum::Extension;
use crate::auth::middleware::AuthUser;

#[utoipa::path(
    get,
    path = "/v1/auth/me",
    responses(
        (status = 200, description = "Current user", body = UserDto),
        (status = 401, description = "Not authenticated"),
    )
)]
pub async fn me(
    State(state): State<AppState>,
    Extension(auth): Extension<AuthUser>,
) -> AppResult<Json<UserDto>> {
    let row: Option<(uuid::Uuid, String, String, String)> = sqlx::query_as(
        "SELECT id, name, email, role::text FROM users WHERE id = $1",
    )
    .bind(auth.id)
    .fetch_optional(&state.pool)
    .await?;

    let (id, name, email, role) = row.ok_or(AppError::Unauthorized)?;
    Ok(Json(UserDto { id, name, email, role }))
}
```

- [ ] **Step 3: Mount `me` behind the middleware** (`api/crates/bt-api/src/app.rs`). Add the import near the top:

```rust
use crate::auth::middleware::require_auth;
```

Then in `build_router`, add a guarded sub-router. Replace the `Router::new()...` chain with:

```rust
    let protected = Router::new()
        .route("/v1/auth/me", get(routes::auth::me))
        .route_layer(axum::middleware::from_fn_with_state(state.clone(), require_auth));

    Router::new()
        .route("/v1/health", get(routes::health::health))
        .route("/v1/auth/login", axum::routing::post(routes::auth::login))
        .route("/api-docs/openapi.json", get(openapi_json))
        .merge(protected)
        .layer(TraceLayer::new_for_http())
        .layer(cors)
        .with_state(state)
```

- [ ] **Step 4: Write the `me` + middleware tests** (`api/crates/bt-api/src/routes/auth.rs`, inside the existing `#[cfg(test)] mod tests`, add these fns). They reuse `seed_one_user`/`app`:

```rust
    async fn get_me(pool: sqlx::PgPool, bearer: Option<&str>) -> StatusCode {
        let mut builder = Request::builder().method("GET").uri("/v1/auth/me");
        if let Some(b) = bearer {
            builder = builder.header("authorization", format!("Bearer {b}"));
        }
        app(pool)
            .oneshot(builder.body(Body::empty()).unwrap())
            .await
            .unwrap()
            .status()
    }

    #[sqlx::test]
    async fn me_returns_user_with_valid_token(pool: sqlx::PgPool) {
        seed_one_user(&pool).await;
        let (_, json) =
            post_login(pool.clone(), r#"{"email":"lead@x.io","password":"demo1234"}"#).await;
        let token = json["token"].as_str().unwrap().to_string();
        assert_eq!(get_me(pool, Some(&token)).await, StatusCode::OK);
    }

    #[sqlx::test]
    async fn me_rejects_missing_token(pool: sqlx::PgPool) {
        assert_eq!(get_me(pool, None).await, StatusCode::UNAUTHORIZED);
    }

    #[sqlx::test]
    async fn me_rejects_garbage_token(pool: sqlx::PgPool) {
        assert_eq!(get_me(pool, Some("not.a.jwt")).await, StatusCode::UNAUTHORIZED);
    }
```

- [ ] **Step 5: Run the tests**

Run: `bash -lc 'cd /Users/lebedev.v/projects/beeteam && docker compose up -d postgres-test >/dev/null && ./api/scripts/test.sh -p bt-api auth'`
Expected: all login + me tests pass (`me_returns_user_with_valid_token`, `me_rejects_missing_token`, `me_rejects_garbage_token` added).

- [ ] **Step 6: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add api/crates/bt-api/src/auth/middleware.rs api/crates/bt-api/src/routes/auth.rs api/crates/bt-api/src/app.rs
git commit -m "feat(api): require_auth middleware + GET /v1/auth/me"
```

---

## Task 5: Backend — register auth in OpenAPI + seed demo1234 hash

**Files:**
- Modify: `api/crates/bt-api/src/openapi.rs`
- Modify: `api/crates/bt-db/Cargo.toml`
- Modify: `api/crates/bt-db/src/seed.rs`

- [ ] **Step 1: Register auth paths + schemas in the OpenAPI doc** (`api/crates/bt-api/src/openapi.rs`). Replace the `#[openapi(...)]` attribute with:

```rust
#[derive(OpenApi)]
#[openapi(
    paths(
        crate::routes::health::health,
        crate::routes::auth::login,
        crate::routes::auth::me,
    ),
    components(schemas(
        bt_domain::Health,
        bt_domain::LoginRequest,
        bt_domain::UserDto,
        bt_domain::LoginResponse,
    )),
    info(title = "BeeTeam API", version = "0.1.0")
)]
pub struct ApiDoc;
```

Update the test in the same file to assert the login path is present:

```rust
    #[test]
    fn openapi_contains_health_path() {
        let doc = ApiDoc::openapi();
        let json = serde_json::to_value(doc).unwrap();
        assert!(json["paths"]["/v1/health"].is_object());
        assert!(json["paths"]["/v1/auth/login"].is_object());
        assert!(json["paths"]["/v1/auth/me"].is_object());
        assert!(json["components"]["schemas"]["LoginResponse"].is_object());
    }
```

- [ ] **Step 2: Add argon2 to `bt-db`** (`api/crates/bt-db/Cargo.toml`, in `[dependencies]` after `thiserror`):

```toml
argon2 = { workspace = true }
```

- [ ] **Step 3: Replace the seed password placeholder** (`api/crates/bt-db/src/seed.rs`). At the top of the file, add the imports (after the existing `use` lines):

```rust
use argon2::password_hash::{rand_core::OsRng, PasswordHasher, SaltString};
use argon2::Argon2;
```

Add a small helper at the bottom of the file (next to the existing `opt` fn):

```rust
/// Argon2id hash used to seed the demo lead's password (demo1234).
fn seed_hash(plain: &str) -> String {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(plain.as_bytes(), &salt)
        .expect("seed: hashing must succeed")
        .to_string()
}
```

Then change the lead-insert bind from the placeholder. Replace:

```rust
    .bind("!seed-no-login") // replaced by Auth plan with a real argon2 hash
```

with:

```rust
    .bind(seed_hash("demo1234")) // demo lead password: demo1234
```

- [ ] **Step 4: Add a seed test asserting the lead can be verified** (`api/crates/bt-db/src/seed.rs`, inside the existing `#[cfg(test)] mod tests`, add):

```rust
    #[sqlx::test(migrations = "./migrations")]
    async fn seeded_lead_password_hash_is_valid_argon2(pool: PgPool) {
        seed_demo(&pool).await.unwrap();
        let hash: (String,) =
            sqlx::query_as("SELECT password_hash FROM users WHERE email = 'e.glebov@beeteam.io'")
                .fetch_one(&pool).await.unwrap();
        // A real Argon2id PHC string starts with "$argon2id$".
        assert!(hash.0.starts_with("$argon2id$"), "got: {}", hash.0);
        assert_ne!(hash.0, "!seed-no-login");
    }
```

- [ ] **Step 5: Run the tests**

Run: `bash -lc 'cd /Users/lebedev.v/projects/beeteam && docker compose up -d postgres-test >/dev/null && ./api/scripts/test.sh -p bt-db && ./api/scripts/test.sh -p bt-api openapi'`
Expected: `seeded_lead_password_hash_is_valid_argon2` + existing bt-db tests pass; `openapi_contains_health_path` passes with the new assertions.

- [ ] **Step 6: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add api/crates/bt-api/src/openapi.rs api/crates/bt-db/Cargo.toml api/crates/bt-db/src/seed.rs api/Cargo.lock
git commit -m "feat(api): register auth in OpenAPI; seed demo lead password (demo1234)"
```

---

## Task 6: Backend — tighten CORS to WEB_ORIGIN

**Files:**
- Modify: `api/crates/bt-api/src/app.rs`
- Modify: `api/crates/bt-api/src/main.rs`

Browser traffic now goes through the Next proxy (same-origin), so axum no longer needs wide-open CORS. Restrict it to `WEB_ORIGIN` (server-to-server calls from Next don't need CORS at all, but keeping a tight allow-list is correct hygiene).

- [ ] **Step 1: Add `web_origin` to `AppState`** (`api/crates/bt-api/src/app.rs`). Change the struct:

```rust
#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub jwt_secret: String,
    pub web_origin: String,
}
```

Change the CORS layer in `build_router` from `.allow_origin(Any)` to use the configured origin. Replace the `let cors = ...` block with:

```rust
    let cors = match state.web_origin.parse::<axum::http::HeaderValue>() {
        Ok(origin) => CorsLayer::new()
            .allow_origin(origin)
            .allow_methods(Any)
            .allow_headers(Any),
        Err(_) => CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(Any)
            .allow_headers(Any),
    };
```

Remove the now-unused `Any` import only if the fallback above is removed — keep `Any` (it's still used in `allow_methods`/`allow_headers` and the fallback).

- [ ] **Step 2: Read `WEB_ORIGIN` in main** (`api/crates/bt-api/src/main.rs`). After the `jwt_secret` line add:

```rust
    let web_origin = std::env::var("WEB_ORIGIN").unwrap_or_else(|_| "http://localhost:3000".into());
```

Change the AppState construction to:

```rust
    let router = build_router(AppState { pool, jwt_secret, web_origin });
```

- [ ] **Step 3: Fix the test AppState constructions** (`api/crates/bt-api/src/routes/auth.rs`). In the test `app` helper, add the field:

```rust
    fn app(pool: sqlx::PgPool) -> axum::Router {
        build_router(AppState {
            pool,
            jwt_secret: "test-secret".into(),
            web_origin: "http://localhost:3000".into(),
        })
    }
```

Also update the health handler test (`api/crates/bt-api/src/routes/health.rs`) — it already has `jwt_secret` (added in Task 3 Step 5b); add `web_origin` so it becomes:

```rust
        let router = build_router(AppState {
            pool,
            jwt_secret: "test-secret".into(),
            web_origin: "http://localhost:3000".into(),
        });
```

- [ ] **Step 4: Run the full backend suite**

Run: `bash -lc 'cd /Users/lebedev.v/projects/beeteam && docker compose up -d postgres-test >/dev/null && ./api/scripts/test.sh'`
Expected: all tests pass (health, auth login/me, password, jwt, openapi, db migration, db seed).

- [ ] **Step 5: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add api/crates/bt-api/src/app.rs api/crates/bt-api/src/main.rs api/crates/bt-api/src/routes
git commit -m "feat(api): tighten CORS to WEB_ORIGIN"
```

---

## Task 7: Regenerate the typed API client

**Files:**
- Modify: `web/lib/api/schema.d.ts` (generated)

- [ ] **Step 1: Start the API and regenerate types**

Run:
```bash
bash -lc 'cd /Users/lebedev.v/projects/beeteam && docker compose up -d postgres minio >/dev/null && lsof -ti :8080 | xargs -r kill 2>/dev/null; set -a && . ./.env && set +a && cd api && (cargo run -p bt-api &) && sleep 1'
```
Wait for the API to listen (poll): `bash -lc 'for i in $(seq 1 30); do curl -s http://localhost:8080/v1/health >/dev/null && echo UP && break; sleep 2; done'`
Then: `bash -lc 'cd /Users/lebedev.v/projects/beeteam/web && pnpm gen:api'`
Then stop the API: `bash -lc 'lsof -ti :8080 | xargs -r kill 2>/dev/null; echo stopped'`

- [ ] **Step 2: Verify the new paths are in the schema**

Run: `bash -lc 'cd /Users/lebedev.v/projects/beeteam/web && grep -c "/v1/auth/login\|/v1/auth/me" lib/api/schema.d.ts'`
Expected: ≥ 2 (both paths present). Also confirm `LoginResponse` and `UserDto` appear: `grep -c "LoginResponse\|UserDto" lib/api/schema.d.ts` → ≥ 2.

- [ ] **Step 3: Typecheck**

Run: `bash -lc 'cd /Users/lebedev.v/projects/beeteam/web && pnpm exec tsc --noEmit'`
Expected: clean (the existing `page.tsx` still references `/v1/health`, which is still in the schema).

- [ ] **Step 4: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/lib/api/schema.d.ts
git commit -m "chore(web): regenerate API types (auth endpoints)"
```

---

## Task 8: Frontend — session helper + Next route handlers (proxy)

**Files:**
- Create: `web/lib/auth.ts`
- Create: `web/app/api/auth/login/route.ts`
- Create: `web/app/api/auth/logout/route.ts`
- Create: `web/app/api/v1/[...path]/route.ts`

The API base URL for server-side proxying: use `process.env.API_INTERNAL_URL ?? "http://localhost:8080"`.

- [ ] **Step 1: Add the API internal URL to env templates**

Append to `/Users/lebedev.v/projects/beeteam/.env.example`:
```bash
# Server-side base URL the Next proxy uses to reach axum (not exposed to the browser)
API_INTERNAL_URL=http://localhost:8080
```
Also append the same line to the local `.env`:
```bash
bash -lc 'cd /Users/lebedev.v/projects/beeteam && grep -q API_INTERNAL_URL .env || printf "\nAPI_INTERNAL_URL=http://localhost:8080\n" >> .env'
```

- [ ] **Step 2: Write the session helper** (`web/lib/auth.ts`):

```ts
import { cookies } from "next/headers";

export const SESSION_COOKIE = "bt_session";
const API = process.env.API_INTERNAL_URL ?? "http://localhost:8080";

export type SessionUser = { id: string; name: string; email: string; role: string };

/** Server-side: read the current user from the session cookie via /v1/auth/me. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const res = await fetch(`${API}/v1/auth/me`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as SessionUser;
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Write the login route handler** (`web/app/api/auth/login/route.ts`):

```ts
import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

const API = process.env.API_INTERNAL_URL ?? "http://localhost:8080";
const WEEK = 60 * 60 * 24 * 7;

export async function POST(req: Request) {
  const { email, password, remember } = await req.json();

  const res = await fetch(`${API}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });

  if (!res.ok) {
    return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
  }

  const data = (await res.json()) as { token: string; user: unknown };
  const response = NextResponse.json({ user: data.user });
  response.cookies.set(SESSION_COOKIE, data.token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    ...(remember ? { maxAge: WEEK } : {}), // omit maxAge → session cookie
  });
  return response;
}
```

- [ ] **Step 4: Write the logout route handler** (`web/app/api/auth/logout/route.ts`):

```ts
import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
```

- [ ] **Step 5: Write the catch-all proxy** (`web/app/api/v1/[...path]/route.ts`):

```ts
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

const API = process.env.API_INTERNAL_URL ?? "http://localhost:8080";

async function proxy(req: NextRequest, path: string[]) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const url = `${API}/v1/${path.join("/")}${req.nextUrl.search}`;
  const headers: Record<string, string> = {};
  const ct = req.headers.get("content-type");
  if (ct) headers["content-type"] = ct;
  if (token) headers["authorization"] = `Bearer ${token}`;

  const body =
    req.method === "GET" || req.method === "HEAD" ? undefined : await req.text();

  const res = await fetch(url, { method: req.method, headers, body, cache: "no-store" });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params.path);
}
export async function POST(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params.path);
}
export async function PATCH(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params.path);
}
export async function DELETE(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params.path);
}
```

- [ ] **Step 6: Typecheck**

Run: `bash -lc 'cd /Users/lebedev.v/projects/beeteam/web && pnpm exec tsc --noEmit'`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/lib/auth.ts web/app/api .env.example
git commit -m "feat(web): session cookie helper + Next auth proxy route handlers"
```

---

## Task 9: Frontend — middleware redirect

**Files:**
- Create: `web/middleware.ts`

- [ ] **Step 1: Write the middleware** (`web/middleware.ts`):

```ts
import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "bt_session";

export function middleware(req: NextRequest) {
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  const { pathname } = req.nextUrl;
  const isLogin = pathname === "/login";

  // Unauthenticated trying to reach an app page → login.
  if (!hasSession && !isLogin) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  // Authenticated visiting the login page → home.
  if (hasSession && isLogin) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  return NextResponse.next();
}

// Run on everything except API routes, Next internals, and static assets.
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
```

> Note: the matcher excludes `/api/*` so the proxy/login/logout handlers are never redirected. The presence of the cookie is the gate; actual token validity is enforced server-side by `getSessionUser()` (a tampered/expired cookie yields `null` → the `(app)` layout redirects, see Task 12).

- [ ] **Step 2: Verify the build compiles with middleware**

Run: `bash -lc 'cd /Users/lebedev.v/projects/beeteam/web && pnpm exec tsc --noEmit'`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/middleware.ts
git commit -m "feat(web): auth middleware (redirect unauthed → /login)"
```

---

## Task 10: Frontend — Avatar + NavItem + Logo composites

**Files:**
- Create: `web/components/Avatar.tsx`
- Create: `web/components/NavItem.tsx`
- Create: `web/components/Logo.tsx`
- Create: `web/components/__tests__/Avatar.test.tsx`
- Create: `web/components/__tests__/NavItem.test.tsx`

- [ ] **Step 1: Write the Avatar test** (`web/components/__tests__/Avatar.test.tsx`):

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Avatar, initialsOf } from "../Avatar";

describe("Avatar", () => {
  it("computes initials from the first two words", () => {
    expect(initialsOf("Евгений Глебов")).toBe("ЕГ");
    expect(initialsOf("Анна")).toBe("А");
    expect(initialsOf("")).toBe("?");
  });

  it("renders initials in the document", () => {
    render(<Avatar name="Евгений Глебов" hue={40} />);
    expect(screen.getByText("ЕГ")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Write Avatar** (`web/components/Avatar.tsx`):

```tsx
import { cn } from "@/lib/utils";

const SIZES = { sm: 24, md: 36, lg: 56, xl: 84 } as const;
type Size = keyof typeof SIZES;

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

export function Avatar({
  name,
  hue,
  size = "md",
  className,
}: {
  name: string;
  hue: number;
  size?: Size;
  className?: string;
}) {
  const px = SIZES[size];
  return (
    <span
      className={cn("inline-flex items-center justify-center rounded-full font-semibold tabular", className)}
      style={{
        width: px,
        height: px,
        fontSize: px * 0.4,
        background: `oklch(0.92 0.05 ${hue})`,
        color: `oklch(0.30 0.08 ${hue})`,
        borderRadius: size === "xl" ? 24 : "9999px",
      }}
      aria-hidden
    >
      {initialsOf(name)}
    </span>
  );
}
```

- [ ] **Step 3: Run the Avatar test**

Run: `bash -lc 'cd /Users/lebedev.v/projects/beeteam/web && pnpm test Avatar'`
Expected: both Avatar tests pass.

- [ ] **Step 4: Write the NavItem test** (`web/components/__tests__/NavItem.test.tsx`):

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { NavItem } from "../NavItem";

describe("NavItem", () => {
  it("marks the active item with aria-current", () => {
    render(<NavItem label="Моя команда" icon="team" active count={8} />);
    const el = screen.getByText("Моя команда").closest("[data-nav-item]")!;
    expect(el).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("8")).toBeInTheDocument();
  });

  it("inactive item has no aria-current", () => {
    render(<NavItem label="Календарь" icon="calendar" />);
    const el = screen.getByText("Календарь").closest("[data-nav-item]")!;
    expect(el).not.toHaveAttribute("aria-current");
  });
});
```

- [ ] **Step 5: Write NavItem** (`web/components/NavItem.tsx`). Icons via lucide-react; map the few names this slice needs:

```tsx
import { Users, Calendar, Layers, SlidersHorizontal, Download, User, Settings, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  team: Users,
  calendar: Calendar,
  layers: Layers,
  fields: SlidersHorizontal,
  download: Download,
  user: User,
  settings: Settings,
};

export function NavItem({
  label,
  icon,
  count,
  active = false,
  disabled = false,
}: {
  label: string;
  icon: keyof typeof ICONS | string;
  count?: number;
  active?: boolean;
  disabled?: boolean;
}) {
  const Icon = ICONS[icon] ?? Users;
  return (
    <div
      data-nav-item
      aria-current={active ? "page" : undefined}
      aria-disabled={disabled || undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] font-medium cursor-default select-none",
        active ? "bg-brand-soft text-brand-text" : "text-ink-2 hover:bg-bg-tint",
        disabled && "opacity-45",
      )}
    >
      <Icon size={16} className="shrink-0" />
      <span className="flex-1">{label}</span>
      {count != null && <span className="tabular text-ink-3 text-xs">{count}</span>}
    </div>
  );
}
```

- [ ] **Step 6: Run the NavItem test**

Run: `bash -lc 'cd /Users/lebedev.v/projects/beeteam/web && pnpm test NavItem'`
Expected: both NavItem tests pass.

- [ ] **Step 7: Write Logo** (`web/components/Logo.tsx`):

```tsx
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-bold tracking-tight", className)}>
      <span className="relative grid h-[26px] w-[26px] place-items-center rounded-md bg-brand text-[15px] font-extrabold text-[#1A1100]">
        B
        <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[#fff8] ring-1 ring-[#1A110022]" />
      </span>
      BeeTeam
    </span>
  );
}
```

- [ ] **Step 8: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/components/Avatar.tsx web/components/NavItem.tsx web/components/Logo.tsx web/components/__tests__
git commit -m "feat(web): Avatar, NavItem, Logo composites"
```

---

## Task 11: Frontend — LoginScreen

**Files:**
- Create: `web/app/login/LoginForm.tsx`
- Create: `web/app/login/page.tsx`
- Create: `web/app/login/__tests__/LoginForm.test.tsx`
- Delete: `web/app/page.tsx` (health probe) — recreated as a redirect-safe placeholder is NOT needed; `(app)/page.tsx` (Task 12) becomes `/`'s content. See note.

> Note on routing: with the `(app)` route group (Task 12), `app/(app)/page.tsx` serves `/`. The old `app/page.tsx` (health probe) must be removed so there's no route conflict at `/`. Delete it in this task.

- [ ] **Step 1: Delete the old health-probe home page**

Run: `bash -lc 'cd /Users/lebedev.v/projects/beeteam && git rm web/app/page.tsx'`

- [ ] **Step 2: Write the LoginForm test** (`web/app/login/__tests__/LoginForm.test.tsx`):

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { LoginForm } from "../LoginForm";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

beforeEach(() => {
  push.mockReset();
  vi.restoreAllMocks();
});

describe("LoginForm", () => {
  it("toggles password visibility", () => {
    render(<LoginForm />);
    const pwd = screen.getByLabelText("Пароль") as HTMLInputElement;
    expect(pwd.type).toBe("password");
    fireEvent.click(screen.getByLabelText("показать пароль"));
    expect(pwd.type).toBe("text");
  });

  it("shows an inline error on failed login", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "invalid credentials" }), { status: 401 }),
    );
    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText("Корпоративная почта"), { target: { value: "x@y.io" } });
    fireEvent.change(screen.getByLabelText("Пароль"), { target: { value: "bad" } });
    fireEvent.click(screen.getByRole("button", { name: /Войти/ }));
    await waitFor(() => expect(screen.getByText("Неверная почта или пароль")).toBeInTheDocument());
    expect(push).not.toHaveBeenCalled();
  });

  it("redirects home on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ user: { id: "1" } }), { status: 200 }),
    );
    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText("Корпоративная почта"), { target: { value: "x@y.io" } });
    fireEvent.change(screen.getByLabelText("Пароль"), { target: { value: "demo1234" } });
    fireEvent.click(screen.getByRole("button", { name: /Войти/ }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
  });
});
```

- [ ] **Step 3: Write LoginForm** (`web/app/login/LoginForm.tsx`):

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, ArrowRight } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, remember }),
      });
      if (!res.ok) {
        setError("Неверная почта или пароль");
        return;
      }
      router.push("/");
    } catch {
      setError("Не удалось войти. Попробуйте ещё раз.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="w-[380px] max-w-full">
      <h1 className="text-[26px] font-bold tracking-tight">С возвращением</h1>
      <p className="mt-1 text-ink-3 text-[13.5px]">Войдите в рабочее пространство своей команды.</p>

      <div className="mt-7 flex flex-col gap-4">
        <div>
          <label htmlFor="email" className="block text-[11px] font-semibold uppercase tracking-wide text-ink-3 mb-1.5">
            Корпоративная почта
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
            className="h-10 w-full rounded-md border border-line bg-bg-elev px-3 text-[13.5px] outline-none focus:border-brand focus:ring-4 focus:ring-[rgba(245,165,36,0.14)]"
          />
        </div>

        <div>
          <div className="flex items-baseline justify-between mb-1.5">
            <label htmlFor="password" className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
              Пароль
            </label>
            <span className="text-[12px] text-brand-strong cursor-default">Забыли пароль?</span>
          </div>
          <div className="relative">
            <input
              id="password"
              type={showPwd ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="h-10 w-full rounded-md border border-line bg-bg-elev px-3 pr-10 text-[13.5px] outline-none focus:border-brand focus:ring-4 focus:ring-[rgba(245,165,36,0.14)]"
            />
            <button
              type="button"
              aria-label="показать пароль"
              onClick={() => setShowPwd((v) => !v)}
              className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded text-ink-3 hover:bg-bg-tint"
            >
              {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        <label className="flex items-center gap-2 py-1 cursor-default select-none text-[13px]">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="accent-[var(--brand)]" />
          Оставаться в системе на этом устройстве
        </label>

        {error && <p role="alert" className="text-[13px] text-miss">{error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-brand text-[14px] font-semibold text-[#1A1100] disabled:opacity-60"
        >
          {pending ? "Входим…" : <>Войти <ArrowRight size={16} /></>}
        </button>
      </div>

      <div className="my-5 flex items-center gap-3 text-[12px] text-ink-4">
        <span className="h-px flex-1 bg-line" /> или <span className="h-px flex-1 bg-line" />
      </div>

      <button
        type="button"
        disabled
        title="Скоро"
        className="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-line bg-bg-elev text-[13.5px] text-ink-2 opacity-70"
      >
        <span className="grid h-4 w-4 grid-cols-2 gap-px">
          <i className="bg-[#f25022]" /><i className="bg-[#7fba00]" /><i className="bg-[#00a4ef]" /><i className="bg-[#ffb900]" />
        </span>
        Войти через Active Directory
      </button>

      <p className="mt-6 text-[12px] leading-relaxed text-ink-3">
        Доменная учётная запись синхронизируется автоматически. Если вы не нашли свою команду — обратитесь к HR-администратору.
      </p>
    </form>
  );
}
```

- [ ] **Step 4: Write the login page (art + form split)** (`web/app/login/page.tsx`):

```tsx
import { Logo } from "@/components/Logo";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-[1.05fr_1fr] bg-bg">
      {/* Art block */}
      <div
        className="relative hidden overflow-hidden p-12 md:flex md:flex-col"
        style={{
          background:
            "radial-gradient(1200px 480px at 12% -8%, color-mix(in oklab, var(--brand) 28%, transparent), transparent 60%), radial-gradient(900px 420px at 90% 12%, color-mix(in oklab, var(--brand) 18%, transparent), transparent 55%), linear-gradient(180deg, var(--bg-elev), var(--bg-tint))",
        }}
      >
        <Logo className="text-[16px] text-ink" />
        <div className="mt-auto max-w-[520px] text-[28px] font-semibold leading-[1.25] tracking-[-0.02em]">
          <span className="text-brand-strong">1-2-1, которые не теряются.</span>
          <br />
          История разговоров, настроение команды и развитие — в одном рабочем пространстве.
        </div>
        <div className="mt-8 flex gap-2 text-[12px] text-ink-3">
          <span>© BeeTeam 2026</span><span className="text-line-strong">·</span>
          <span>Политика конфиденциальности</span><span className="text-line-strong">·</span>
          <span>Безопасность</span>
        </div>
      </div>

      {/* Form block */}
      <div className="flex items-center justify-center p-8">
        <LoginForm />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run the LoginForm tests**

Run: `bash -lc 'cd /Users/lebedev.v/projects/beeteam/web && pnpm test LoginForm'`
Expected: all three tests pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/app/login   # the page.tsx deletion is already staged by `git rm` in Step 1
git commit -m "feat(web): LoginScreen (split art + form, password toggle, inline error)"
```

---

## Task 12: Frontend — (app) shell (Sidebar + Topbar + layout)

**Files:**
- Create: `web/components/Sidebar.tsx`
- Create: `web/components/Topbar.tsx`
- Create: `web/app/(app)/layout.tsx`
- Create: `web/app/(app)/page.tsx`

- [ ] **Step 1: Write Sidebar** (`web/components/Sidebar.tsx`). Client component (logout needs an onClick + router):

```tsx
"use client";
import { useRouter } from "next/navigation";
import { Logo } from "./Logo";
import { Avatar } from "./Avatar";
import { NavItem } from "./NavItem";
import { Bell, LogOut } from "lucide-react";
import type { SessionUser } from "@/lib/auth";

const TEAM_NAV = [
  { id: "team", label: "Моя команда", icon: "team", count: 8, active: true, disabled: false },
  { id: "calendar", label: "Календарь", icon: "calendar", count: 4, active: false, disabled: true },
  { id: "grades", label: "Грейды", icon: "layers", active: false, disabled: true },
  { id: "fields", label: "Конструктор полей", icon: "fields", active: false, disabled: true },
  { id: "export", label: "Экспорт", icon: "download", active: false, disabled: true },
] as const;

const ADMIN_NAV = [
  { id: "admin-team", label: "Команды", icon: "team", disabled: true },
  { id: "admin-leads", label: "Лиды", icon: "user", disabled: true },
  { id: "admin-settings", label: "Настройки", icon: "settings", disabled: true },
] as const;

export function Sidebar({ user }: { user: SessionUser }) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex w-[232px] shrink-0 flex-col gap-4 border-r border-line bg-bg-elev p-4">
      <div className="flex items-center justify-between px-1.5">
        <Logo className="text-[15px]" />
        <button className="grid h-7 w-7 place-items-center rounded text-ink-3 hover:bg-bg-tint" title="Уведомления">
          <Bell size={15} />
        </button>
      </div>

      <div className="flex flex-col gap-0.5">
        <div className="px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-ink-4">Команда</div>
        {TEAM_NAV.map((n) => (
          <NavItem key={n.id} label={n.label} icon={n.icon} count={"count" in n ? n.count : undefined} active={n.active} disabled={n.disabled} />
        ))}
      </div>

      <div className="flex flex-col gap-0.5">
        <div className="px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-ink-4">Администрирование</div>
        {ADMIN_NAV.map((n) => (
          <NavItem key={n.id} label={n.label} icon={n.icon} disabled={n.disabled} />
        ))}
      </div>

      <div className="mt-auto flex items-center gap-2.5 rounded-md border border-line bg-bg-elev p-2.5">
        <Avatar name={user.name} hue={42} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold tracking-tight">{user.name}</div>
          <div className="text-[11.5px] text-ink-3">{user.role}</div>
        </div>
        <button onClick={logout} className="grid h-7 w-7 place-items-center rounded text-ink-3 hover:bg-bg-tint" title="Выйти" aria-label="Выйти">
          <LogOut size={14} />
        </button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Write Topbar** (`web/components/Topbar.tsx`):

```tsx
import { Search, Plus } from "lucide-react";

export function Topbar({ title }: { title: string }) {
  return (
    <div className="sticky top-0 z-10 flex h-[60px] items-center gap-3 border-b border-line bg-[color-mix(in_oklab,var(--bg)_80%,transparent)] px-6 backdrop-blur">
      <div className="text-[13.5px] font-medium text-ink">{title}</div>
      <div className="ml-auto flex items-center gap-2">
        <button className="grid h-8 w-8 place-items-center rounded-md text-ink-3 hover:bg-bg-tint" title="Помощь">?</button>
        <button className="grid h-8 w-8 place-items-center rounded-md text-ink-3 hover:bg-bg-tint" title="Поиск"><Search size={14} /></button>
        <button className="flex h-8 items-center gap-1.5 rounded-md bg-brand px-3 text-[13px] font-semibold text-[#1A1100]" title="Новая 1-2-1">
          <Plus size={13} /> Новая 1-2-1
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write the (app) layout** (`web/app/(app)/layout.tsx`). Server component; redirects if the cookie is invalid/expired (defense beyond the middleware's presence check):

```tsx
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen bg-bg text-ink">
      <Sidebar user={user} />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
```

- [ ] **Step 4: Write the placeholder home page** (`web/app/(app)/page.tsx`):

```tsx
import { Topbar } from "@/components/Topbar";

export default function TeamHome() {
  return (
    <>
      <Topbar title="Моя команда" />
      <div className="p-6">
        <div className="rounded-lg border border-dashed border-line-strong bg-bg-tint p-10 text-center text-ink-3">
          <p className="text-[15px] font-medium text-ink-2">Здесь будет ваша команда</p>
          <p className="mt-1 text-[13px]">Список сотрудников и метрики появятся в следующем срезе (TeamList).</p>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 5: Typecheck + build**

Run: `bash -lc 'cd /Users/lebedev.v/projects/beeteam/web && pnpm exec tsc --noEmit && pnpm build 2>&1 | tail -6'`
Expected: tsc clean; build succeeds (routes `/login` and `/` present).

- [ ] **Step 6: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add "web/app/(app)" web/components/Sidebar.tsx web/components/Topbar.tsx
git commit -m "feat(web): (app) shell — Sidebar + Topbar + auth-gated layout"
```

---

## Task 13: End-to-end auth test (Playwright)

**Files:**
- Create: `web/e2e/auth.spec.ts`

- [ ] **Step 1: Write the e2e test** (`web/e2e/auth.spec.ts`):

```ts
import { test, expect } from "@playwright/test";

test("unauthenticated visit redirects to login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "С возвращением" })).toBeVisible();
});

test("wrong password shows an inline error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Корпоративная почта").fill("e.glebov@beeteam.io");
  await page.getByLabel("Пароль").fill("wrongpass");
  await page.getByRole("button", { name: /Войти/ }).click();
  await expect(page.getByText("Неверная почта или пароль")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("login then logout round-trips through the shell", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Корпоративная почта").fill("e.glebov@beeteam.io");
  await page.getByLabel("Пароль").fill("demo1234");
  await page.getByRole("button", { name: /Войти/ }).click();

  // Lands in the (app) shell.
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Евгений Глебов")).toBeVisible();
  await expect(page.getByText("Моя команда").first()).toBeVisible();

  // Logout returns to login.
  await page.getByRole("button", { name: "Выйти" }).click();
  await expect(page).toHaveURL(/\/login$/);
});
```

- [ ] **Step 2: Run the e2e suite end-to-end.**

Bring up infra + API, then run Playwright (it starts `pnpm dev` itself). Ports must be free first.
```bash
bash -lc 'cd /Users/lebedev.v/projects/beeteam && docker compose up -d postgres minio >/dev/null && lsof -ti :8080 | xargs -r kill 2>/dev/null; lsof -ti :3000 | xargs -r kill 2>/dev/null; set -a && . ./.env && set +a && cd api && (cargo run -p bt-api &)'
```
Wait for API: `bash -lc 'for i in $(seq 1 30); do curl -s http://localhost:8080/v1/health >/dev/null && echo UP && break; sleep 2; done'`
Run e2e: `bash -lc 'cd /Users/lebedev.v/projects/beeteam/web && pnpm exec playwright test auth'`
Expected: 3 passed.
Then stop the API: `bash -lc 'lsof -ti :8080 | xargs -r kill 2>/dev/null; lsof -ti :3000 | xargs -r kill 2>/dev/null; echo stopped'`

- [ ] **Step 3: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/e2e/auth.spec.ts
git commit -m "test(web): e2e auth — redirect, wrong-password, login→shell→logout"
```

---

## Task 14: Full-stack verification sweep

**Files:** none (verification only)

- [ ] **Step 1: Backend suite (isolated test DB)**

Run: `bash -lc 'cd /Users/lebedev.v/projects/beeteam && docker compose up -d postgres-test >/dev/null && ./api/scripts/test.sh'`
Expected: all groups pass (health, auth login/me, password, jwt, openapi, db migration, db seed incl. the new argon2 seed assertion).

- [ ] **Step 2: Frontend unit tests + typecheck + build**

Run: `bash -lc 'cd /Users/lebedev.v/projects/beeteam/web && pnpm test && pnpm exec tsc --noEmit && pnpm build 2>&1 | tail -4'`
Expected: Vitest all green (token tests + Avatar + NavItem + LoginForm); tsc clean; build OK.

- [ ] **Step 3: Confirm clean tree**

Run: `bash -lc 'cd /Users/lebedev.v/projects/beeteam && git status --porcelain'`
Expected: empty (everything committed).

This slice is complete when Steps 1–3 are green. Then proceed to `finishing-a-development-branch`.

---

## Done criteria

- `POST /v1/auth/login` returns a JWT + user for `e.glebov@beeteam.io` / `demo1234`; identical 401 for wrong password and unknown email.
- `GET /v1/auth/me` returns the user behind `require_auth`; 401 without/with a bad token.
- CORS restricted to `WEB_ORIGIN`.
- OpenAPI doc lists `/v1/auth/login` + `/v1/auth/me`; `schema.d.ts` regenerated and committed.
- Browser → Next proxy → axum with the JWT in an httpOnly `bt_session` cookie; `remember` controls cookie persistence.
- `middleware.ts` redirects unauthed `(app)` → `/login` and authed `/login` → `/`.
- LoginScreen matches the prototype (split art + form, password toggle, "Оставаться в системе", stubbed AD/forgot-password); inline error on failure.
- `(app)` shell renders Sidebar (user from `/auth/me`, working logout) + Topbar; content is the "Моя команда" placeholder (TeamList is the next slice).
- Playwright e2e proves redirect, wrong-password, and login→shell→logout.

The next slice (`...-beeteam-teamlist.md`) replaces the `(app)/page.tsx` placeholder with the real TeamList, and switches browser data fetching to the `/api/v1/*` proxy path.
```
