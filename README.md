# Alumni Influencers Platform

Server-rendered Express + SQLite application that delivers both the alumni-facing influencer marketplace (Coursework 1) and the **University Analytics & Intelligence Dashboard** (Coursework 2). One codebase, one process, two role-based experiences.

## Stack

- Node 20+, Express 5
- EJS server-side rendering with `express-ejs-layouts`
- SQLite via `better-sqlite3` (sessions, app data) with WAL mode and foreign key enforcement
- `express-session` + `connect-sqlite3` for browser sessions
- Bearer-token API keys with scope enforcement (`api_tokens.scopes` column)
- Chart.js (CDN) for client-rendered, animated, interactive charts
- `pdfkit` and `csv-stringify` for analytics export
- `helmet`, `cors`, `express-rate-limit`, custom CSRF, `bcryptjs`
- `nodemailer` for email (SMTP or JSON transport)
- `node-cron` for the 6 PM winner selection and midnight activation jobs
- `swagger-ui-express` + `swagger-jsdoc` for `/api-docs`
- `jest` + `supertest` for the test suite

## Setup

```bash
cp .env.example .env
npm install
npm run seed -- --force   # populates 50 sample alumni + 2 demo accounts + 2 API tokens
npm start
# Visit http://localhost:3000
# Swagger:  http://localhost:3000/api-docs
```

The seed script prints two bearer tokens to stdout (one Analytics Dashboard preset, one AR App preset) and creates two reference accounts. The email domain comes from `UNIVERSITY_EMAIL_DOMAIN` in your `.env`:

- `analytics-demo@<domain>` (role `university_staff`)
- `alumni-demo@<domain>` (role `alumni`)
- Password for both: `Demo!12345678`

## Roles & navigation

`users.role` is set at registration (radio button on the form) and gates the navigation. Both roles share the auth flows (login, register, forgot/reset password, email verification).

| Role | Pages |
|---|---|
| `alumni` | `/dashboard`, `/profile`, `/bidding`, `/developer/api-keys` |
| `university_staff` | `/dashboard`, `/analytics`, `/analytics/<chart>`, `/analytics/report.pdf`, `/alumni` |

Page-level RBAC is enforced by the `requireRole(...)` middleware in `lib/middleware.js`. Role-mismatched users get redirected to their canonical landing page with a flash message.

## API key scopes

Bearer tokens carry one or more **scopes** in `api_tokens.scopes` (space-separated). The dashboard's "create key" form ships two presets:

| Preset | Scopes | Suitable client |
|---|---|---|
| `analytics_dashboard` | `read:alumni`, `read:analytics` | The University Analytics Dashboard |
| `ar_app` | `read:alumni_of_day` | The Mobile AR App |
| `custom` | (manual) | Anything else |

The reserved scope `read:donations` is recognised by the validator but no endpoint consumes it yet; it is left in place for future extension.

`requireScopes(...)` middleware sits on every `/api/*` route. Missing scopes return:

```json
{ "message": "Token is missing one or more required scopes.", "missing": ["read:analytics"] }
```

## Routes

### SSR pages

| Method | Path | Auth |
|---|---|---|
| GET | `/` | public |
| GET / POST | `/login` | public |
| GET / POST | `/register` | public |
| GET / POST | `/forgot-password` | public |
| GET / POST | `/reset-password` | public |
| GET | `/verify-email?token=...` | public |
| POST | `/logout` | session |
| GET | `/dashboard` | session + verified |
| GET / POST | `/profile` | session + verified + alumni |
| POST | `/profile/achievements` | session + verified + alumni |
| POST | `/profile/employment` | session + verified + alumni |
| GET | `/bidding` | session + verified + alumni |
| POST | `/bidding`, `/bidding/cancel/:id`, `/bidding/event-participation` | session + verified + alumni |
| GET / POST | `/developer/api-keys` | session + verified + alumni |
| GET | `/developer/api-keys/:id/usage` | session + verified + alumni |
| POST | `/developer/api-keys/:id/revoke` | session + verified + alumni |
| GET | `/analytics` | session + verified + university_staff |
| GET | `/analytics/<slug>` (8 chart pages) | session + verified + university_staff |
| GET | `/analytics/report.pdf` | session + verified + university_staff |
| GET / POST | `/alumni` | session + verified + university_staff |
| POST | `/alumni/presets`, `/alumni/presets/:id/delete` | session + verified + university_staff |

### JSON API (Postman / AR client / AJAX)

| Method | Path | Auth |
|---|---|---|
| GET | `/health` | public |
| GET | `/auth/session` | public |
| POST | `/auth/register`, `/auth/login`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/resend-verification` | public + CSRF |
| GET | `/auth/verify-email?token=...` | public |
| POST | `/auth/logout` | session + CSRF |
| GET / PUT | `/profile/me`, `/profile/me/achievements/:type`, `/profile/me/employment-history` | session + verified |
| GET / POST / DELETE | `/bids`, `/bids/overview`, `/bids/history`, `/bids/:id` | session + verified |
| POST | `/events/participation` | session + verified |
| GET / POST / DELETE | `/developer/api-keys.json`, `/developer/api-keys/:id/usage.json`, `/developer/api-keys/:id.json` | session + verified |
| GET | `/api/public/featured/today` | bearer + scope `read:alumni_of_day` |
| GET | `/api/analytics/summary` | bearer + scope `read:analytics` |
| GET | `/api/analytics/employment-by-sector` | bearer + scope `read:analytics` |
| GET | `/api/analytics/job-titles?limit=N` | bearer + scope `read:analytics` |
| GET | `/api/analytics/top-employers?limit=N` | bearer + scope `read:analytics` |
| GET | `/api/analytics/geographic` | bearer + scope `read:analytics` |
| GET | `/api/analytics/skills-gap` | bearer + scope `read:analytics` |
| GET | `/api/analytics/professional-development` | bearer + scope `read:analytics` |
| GET | `/api/analytics/curriculum-coverage` | bearer + scope `read:analytics` |
| GET | `/api/analytics/cohort-trend` | bearer + scope `read:analytics` |
| GET | `/api/alumni` | bearer + scope `read:alumni` |

Every analytics endpoint accepts the standard filter set as query params: `programme`, `graduationFrom`, `graduationTo`, `sector`, `country`. Append `?format=csv` to any of them for a streaming CSV download.

## Charts

The hub at `/analytics` renders eight chart cards. Each click navigates to a detail page that:

1. Loads via `views/partials/chart-page.ejs`.
2. Embeds the dataset as JSON inside `<script id="chart-data" type="application/json">`.
3. `public/js/charts.js` reads it, picks a chart-type-specific Chart.js config (animation, tooltips, legends), and applies a colour-coded insight badge using the rules below.
4. `public/js/analytics-page.js` wires the "Download PNG" button to `chart.toBase64Image()` and the "Export CSV" link to `?format=csv`.

| Slug | Chart | Insight rule |
|---|---|---|
| `employment-sector` | doughnut | top sector >= 40% critical, >= 20% significant, otherwise healthy |
| `job-titles` | horizontal bar | top role labelled |
| `top-employers` | bar | top employer >= 15% critical |
| `geographic` | pie | top country share annotated |
| `skills-gap` | stacked bar | programme with single-sector concentration >= 60% critical |
| `professional-development` | line (multi-series) | first to last delta determines emerging or declining |
| `curriculum-coverage` | radar (per programme) | any axis under 0.2 critical |
| `cohort-trend` | line | year-on-year delta |

## Reports

`/analytics/report.pdf` streams a PDFKit-generated report with a cover page, table of contents, and one page per metric (table + computed insight paragraph). Charts themselves are not embedded server-side (which would need a headless browser); per-chart PNGs are downloadable from the dashboard.

## Database schema

Tables (3NF, with foreign-key cascades):

- `users(id, email, password_hash, role, email_verified_at, verification_token_hash, verification_token_expires_at, reset_token_hash, reset_token_expires_at, last_login_at, created_at, updated_at)`
- `profiles(user_id PK, first_name, last_name, biography, linkedin_url, profile_image_path, programme, graduation_date, directory_visible, created_at, updated_at)`
- `achievements(id, user_id, achievement_type, title, reference_url, completion_date, created_at)`
- `employment_history(id, user_id, employer, job_title, start_date, end_date, industry_sector, location_country, location_city, is_current, created_at)`
- `bids(id, user_id, target_date, amount, status, created_at, updated_at)` with UNIQUE(user_id, target_date)
- `featured_slots(id, target_date UNIQUE, user_id, bid_id UNIQUE, bid_amount, status, selected_at, activated_at)`
- `alumni_event_participation(id, user_id, event_name, participated_on, grants_extra_slot_month)` UNIQUE per user per month
- `api_tokens(id, created_by_user_id, name, token_prefix, token_hash UNIQUE, scopes, revoked_at, last_used_at, created_at)`
- `api_token_usage(id, api_token_id, endpoint, http_method, ip_address, user_agent, response_status, created_at)`
- `analytics_filter_presets(id, user_id, name, filters_json, created_at)`

Migration strategy: `db.js` calls `addColumnIfMissing` so existing CW1 databases upgrade in place on boot. Indexes added for analytics joins (`programme + graduation_date`, `industry_sector`, `is_current`).

## Security

- `bcryptjs` (12 rounds) for password hashes
- Password policy: 12+ chars with upper, lower, digit, symbol
- Tokens (verification, reset, API key) created with `crypto.randomBytes(32)` and stored as SHA-256 hashes
- Session cookie: httpOnly, sameSite=lax, rolling, configurable max-age
- CSRF: session-bound opaque token, accepted via `x-csrf-token` header *or* `_csrf` body field for HTML forms
- `helmet` with a permissive but explicit Content-Security-Policy that allows the Chart.js CDN
- CORS pinned to `CLIENT_ORIGIN`
- Rate limiting: 20/15min on auth, 60/60s on bearer-token API
- All `/api/*` requests are logged to `api_token_usage` with endpoint, method, IP, UA, response status, timestamp

## Tests

```bash
npm test            # one-shot Jest run with a per-run temp DB
npm run test:watch  # interactive
```

The Jest suite covers:

- Authentication: domain restriction, weak-password rejection, role on registration, verified-only login, CSRF enforcement.
- Scope enforcement: AR token vs. analytics endpoint, analytics token vs. AR endpoint, alumni endpoint coverage, legacy `featured:read` migration.
- Analytics endpoints: summary, employment-by-sector ordering, programme filter, CSV export, geographic, curriculum coverage buckets, cohort trend.
- Alumni directory: pagination, sector filter, `directory_visible=0` exclusion.
- API key creation: unknown scopes rejected, explicit scopes accepted, `clientPreset` fallback.
- SSR pages: landing, login, register, role-aware dashboard, RBAC redirect on staff-only pages.

Each test file imports `tests/setup.js`'s `registerCleanup()` to truncate every table before each test for isolation. The DB path is overridden to `./data/test.sqlite` via `cross-env`.

## Postman

`api-tests/postman/` contains:

- `Alumni Influencers.postman_collection.json` covers Auth, Profile, Bids, Developer, Public API, **Analytics Dashboard** (10), **Alumni Directory** (4), and **API Key Scoping Demo** (3 with assertions for the 403/200 sequence).
- `Local.postman_environment.json` exposes `analyticsBearer` and `arBearer` for the tokens printed by `npm run seed`.

## Deployment

`deployment/nginx/nginx.conf` shows the reverse-proxy + load-balancer config (two app instances on 3000 / 3001 with `ip_hash` routing to keep sessions sticky to one instance).
