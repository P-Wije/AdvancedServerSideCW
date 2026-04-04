# Alumni Influencers API

Relational, security-focused Express API for the University of Eastminster Alumni Influencers coursework. The project uses MVC-style separation with client-side rendering in `public`, request controllers in `controllers`, shared infrastructure in `lib`, and SQLite bootstrap logic in `db.js`.

## Architecture

### Stack
- Express 5 for HTTP routing and middleware orchestration.
- SQLite via `better-sqlite3` for a lightweight relational database with foreign keys and indexing.
- `express-session` plus `connect-sqlite3` for secure server-side sessions.
- `multer` for controlled profile image uploads.
- `swagger-ui-express` and `swagger-jsdoc` for interactive API documentation at `/api-docs`.
- `node-cron` for automated winner selection and profile activation jobs.

### Folder structure
- `controllers`: feature controllers for auth, profile, bidding, API keys, and public API responses.
- `lib`: config, middleware, validation, security helpers, scheduler logic, mailer, Swagger, and repository helpers.
- `public`: client-side rendered dashboard and utility pages.
- `db.js`: schema creation, table bootstrapping, and index creation.
- `index.js`: application entry point and route wiring.

## Security decisions

- Passwords are hashed with `bcryptjs` using 12 salt rounds.
- Password policy requires 12+ characters including uppercase, lowercase, numeric, and special characters.
- Verification tokens, reset tokens, and API bearer tokens are generated cryptographically and stored only as SHA-256 hashes.
- CSRF protection uses a session-bound token sent through the `x-csrf-token` header for all state-changing browser routes.
- `helmet` sets secure HTTP headers and `cors` is restricted to the configured client origin.
- Rate limiting is applied separately to authentication and public API routes.
- Sessions are `httpOnly`, `sameSite=lax`, rolling, and expiry-bound.
- API key usage logs capture endpoint, method, IP address, user agent, response status, and timestamp.

## Relational database design

The schema is normalised to third normal form:

- `users`: one row per alumnus account.
- `profiles`: one profile row per user.
- `achievements`: one row per degree, certification, licence, or short course.
- `employment_history`: one row per employment record.
- `bids`: one row per user per target featured date.
- `featured_slots`: selected or active featured winners for each date.
- `alumni_event_participation`: tracks the monthly event bonus that enables a 4th appearance opportunity.
- `api_tokens`: hashed bearer tokens and lifecycle metadata.
- `api_token_usage`: append-only API usage audit trail.

## Bidding workflow

1. Alumni place a blind bid for tomorrow's featured slot before 6:00 PM.
2. They never see the leading amount, only a winning or losing status.
3. Increasing a bid is allowed, decreasing is blocked.
4. At 6:00 PM a scheduler selects the highest active bid and marks it as `scheduled`.
5. At midnight the scheduled winner becomes `active` for the new day.
6. Monthly appearance limits are enforced using `featured_slots` plus `alumni_event_participation`.

## Running locally

1. Copy `.env.example` to `.env`.
2. Install dependencies with `npm install`.
3. Start the app with `npm start`.
4. Open [http://localhost:3000](http://localhost:3000).
5. Open [http://localhost:3000/api-docs](http://localhost:3000/api-docs) for Swagger.

## Key routes

### Authentication and session
- `POST /auth/register`
- `GET /auth/verify-email?token=...`
- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `GET /auth/session`

### Profile
- `GET /profile/me`
- `POST /profile/me`

### Bidding
- `GET /bids/overview`
- `GET /bids/history`
- `POST /bids`
- `DELETE /bids/:id`
- `POST /events/participation`

### Developer API management
- `GET /developer/api-keys`
- `POST /developer/api-keys`
- `GET /developer/api-keys/:id/usage`
- `DELETE /developer/api-keys/:id`

### Public developer API
- `GET /api/public/featured/today`

## Notes

- The public pages are intentionally client-rendered to match the requirement that richer server views can arrive in CW Part 2.
- Email delivery uses SMTP when environment variables are configured; otherwise it falls back to a JSON transport so flows can still be demonstrated locally.
- SQLite was chosen to satisfy the relational requirement while keeping setup simple for live demonstration.
