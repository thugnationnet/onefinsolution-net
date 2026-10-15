# One Fin Solution deployment

Operational cutover checklist (domain, Stripe, Resend, Railway, GitHub): see [`docs/INFRASTRUCTURE-MIGRATION.md`](docs/INFRASTRUCTURE-MIGRATION.md).

The application is being prepared for a fresh Railway deployment at `https://onefinsolution.net`. Railway project, service, and environment identifiers are supplied during setup and are not bound in this repository. Keep the existing PostgreSQL database and its customer records; this migration changes deployment and payment-provider bindings, not application data. No Supabase project is required or used.

## Infrastructure and migration

The previous integration used Supabase for PostgreSQL queries, Auth passwords and sessions, browser auth listeners, OAuth callbacks, RLS identity, profile triggers, and chat-message functions. All runtime SDK usage has been replaced with `pg`, server-side ownership checks, scoped PostgreSQL RLS, database-backed opaque sessions, and standard Next.js actions/routes. Supabase, Anthropic, and Update.dev packages are removed. Historical SQL files are retained only as source records; deployment applies only `migrations/railway/*.sql`.

`DATABASE_URL` must point to the PostgreSQL database that is to be preserved. No credentials are embedded in the repository. The native schema includes users, sessions, verification/reset tokens, auth rate limits, profiles, chats/messages, contexts, Stripe customer links, subscription snapshots, checkout attempts, credit buckets/allocations/usage, indexes, foreign keys, RLS and atomic credit functions.

`npm run db:migrate` checks migration checksums with normalized line endings, takes an advisory lock, and applies each new file transactionally. Railway runs it before deployment. The first migration refuses a populated legacy schema rather than overwriting it. No source Supabase credentials/project were supplied; no external historical records were accessible to import. Existing Railway data is preserved.

`.railway/railway.ts` declares only the web service, preserves its configured database URL, and does not bind a custom domain. Review `railway config plan` before apply, confirm it will not create, replace, or delete a database, and verify every preserved variable before applying.

## Authentication

Passwords use salted scrypt, minimum 12 and maximum 128 characters. Sessions use 256-bit random opaque tokens; only their SHA-256 hashes are stored. Production cookies use the `__Host-` prefix, HttpOnly, Secure, SameSite=Lax, and a seven-day lifetime. Every protected page and mutation checks the database session; middleware cookie checks are only routing hints. Server Actions enforce Next.js origin checks. Database rate limits cover account and IP attempts. Unknown-account responses avoid enumeration.

Signup is available without email verification; new accounts can sign in immediately. Verification-token handling remains for existing flows. Password-reset links last 30 minutes, tokens are hashed and single-use, and password reset invalidates all sessions and other reset tokens. Missing SMTP blocks email-dependent reset operations with a clear error; the app never claims mail was sent when delivery was unavailable. SMTP acceptance does not prove inbox delivery; verify actual receipt with the configured provider. Google OAuth buttons were removed because no Google provider is configured; email callback and redirects are implemented.

User queries run with a scoped database role inside transactions, using `app.user_id` for RLS. Pool reuse cannot retain another user's identity. Server billing/auth operations remain private and use the database owner connection; no database credentials or billing RPCs are exposed to browsers.

## Required environment variables

See `.env.example`. Configure actual values in Railway or ignored `.env.local`, never source or Git:

- Existing infrastructure: `DATABASE_URL`, `NEXT_PUBLIC_SITE_URL=https://onefinsolution.net`, `PORT` (Railway supplies it).
- Mail: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` with a verified sender.
- AI: `AI_PROVIDER=openai`, `OPENAI_MODEL=gpt-4.1-mini`, `OPENAI_API_KEY`; alternatively `AI_PROVIDER=xai`, `XAI_MODEL=grok-4.3`, `XAI_API_KEY`.
- Billing: `BILLING_PROVIDER=stripe`, `STRIPE_MODE=test`, `STRIPE_SECRET_KEY`, `STRIPE_EXPECTED_ACCOUNT_ID`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_CREDIT_PLANS`.
- Optional shared auth: leave `SESSION_COOKIE_DOMAIN` unset for host-only cookies, or set it only when subdomains must share sessions.
- Workspace credits: `SIGNUP_CREDITS=10`, `WORKSPACE_CREDIT_COST=1`.

Opaque sessions require no JWT/signing secret. No Supabase, Update.dev, or Anthropic configuration is required.

## AI providers

OpenAI uses the official SDK's Responses API with `store:false`; xAI uses its compatible Chat Completions endpoint at `https://api.x.ai/v1`. Provider/model settings are server-only. Saved legacy model preferences resolve to the configured provider without changing historical chats. API timeouts, rate limits, unavailable credentials, empty responses, and provider failures return safe errors. Workspace task responses consume Workspace credits only after success; failures refund their reservation once. Homepage Chat is gated by its separate subscription and does not consume Workspace credits. No valid AI key is currently available, so real inference is not yet verified.

## Chat and Workspace capabilities

Homepage Chat and Workspace share the configured AI provider, but keep distinct access and billing: Chat requires active subscription access; Workspace task execution requires authentication and a successful credit reservation. Chat turns are saved in the conversation database and responses stream to the browser. Chat supports up to three PNG/JPEG/WebP/GIF images (2 MB each, 3.5 MB total) and up to 20,000 characters of supported text/code attachments per message. Image bytes are forwarded for inference but are not retained in message history; the conversation stores the user message and attachment name. Browser speech recognition and speech synthesis depend on browser support and permission.

Workspace supports supported text/code attachments up to 100 KB each and 20,000 total characters, plus up to three validated PNG/JPEG/WebP/GIF images (2 MB each, 3.5 MB total). Images are inspected for file-signature/MIME agreement and passed to the configured AI provider for the current task; they are not stored in task history. Successful Workspace tasks consume one configured credit; provider failures refund the reservation. Conversation/task history, text, credit usage, and transactions are stored with account ownership checks.

Website/map links in Chat are passed as URLs only; their page content is not fetched. No web-search provider, file/object storage, PDF/binary-document parser, image generator, generated-file execution, real-time voice service, or audio transcription/synthesis API is configured. Chat speech input/output uses browser-native APIs only. Workspace automatic and scheduled credit reloads are not enabled. Do not treat any of these capabilities as operational until their provider/storage integration, permission model, configuration, and tests are added.

## Stripe Test catalog

These initial USD test amounts are implementation defaults, not approved Live business prices:

| Product | Price | Access |
| --- | --- | --- |
| Homepage chat plans | Daily $5, Weekly $13, Monthly $30, Yearly $249 | Subscription access to homepage chat only; no Workspace credits |
| Workspace credit pack | $5 once | 50 Workspace credits; no chat subscription |

`node scripts/provision-stripe.mjs` verifies the explicitly configured Stripe Test account before any write. Its default is dry-run; `--apply` provisions only app-managed Workspace one-time Test products, prices, and the webhook at the configured site origin. Homepage chat recurring prices are managed separately. Generated identifiers are kept in ignored `.stripe-test-ids.json`; the runtime subscription map is `billing/personal-plan-ids.json`. A new webhook signing secret is stored only in ignored `.env.stripe-generated`. Existing unmanaged or mismatched objects fail closed. `node scripts/configure-railway.mjs --apply` requires explicit Railway project/service/environment identifiers and complete Test credentials and mappings. It transfers values through stdin and suppresses secrets. Do not remove the previous account's webhook or production variables until the replacement is tested and the cutover is approved.

The raw-body webhook `/api/stripe/webhook` verifies signatures, rejects Live events and grants only verified one-time Workspace credit-pack payments. Homepage chat subscriptions are processed separately and grant access only; they never create Workspace credit. Checkout reconciliation verifies the authenticated owner's Stripe customer and actual payment state. Stable references prevent duplicate credits. Subscription state is fetched from Stripe, not trusted from stale events. Plan changes take effect at renewal without proration. Cancellation preserves chat access through the paid period. Workspace packs and signup credits do not expire.

Workspace credit reservations serialize on the user row, reject overspending, and refund failed tasks exactly once. Abandoned reservations are reconciled after ten minutes. Browser roles cannot mint, spend, or refund directly.

## Verification

Commands: `npm ci`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run db:migrate`, `npm start`.

Tests use actual PostgreSQL SQL through PGlite for native schema/RLS, atomic credits, auth confirmation/reset, expiry, hashing, session revocation, rate limits and concurrency. Stripe signature tests use real signature verification with mocked network fulfillment. Provider mocks do not establish real provider availability.

After credentials arrive, test actual email receipt; signup/signin/profile/logout/recovery; session persistence and guest protection; context CRUD and chat persistence; OpenAI/xAI successful and failed Workspace requests; paid/declined/cancelled Stripe Test credit-pack payments; duplicate/out-of-order webhooks; chat-subscription renewal/plan changes/cancellation; and separate Workspace credit fulfillment. Verify `onefinsolution.net` and the checkout flow on Railway. Inspect Railway runtime logs afterwards. A custom domain serving HTTP 200 alone does not prove these integrations work.

No repository-owned YAML files exist; deployment uses TypeScript IaC. No extra YAML tooling is needed.

## Later Live switch

1. Approve exact business prices/credits and complete real Test end-to-end verification first.
2. Use a separate Live environment/account data boundary; create corresponding Live products, prices and webhook. Never reuse Test IDs or customer/subscription records.
3. Configure that Live account identity/key, webhook signing secret and exact Live Price-to-credit mapping.
4. Set `STRIPE_MODE=live` only with explicit approval and matching Live keys, account ID, webhook secret, and Live Price mappings. Production NODE_ENV alone never implies Live Mode.
5. Rebuild/deploy; verify a controlled real charge, signature enforcement, allowance assignment, renewal, cancellation, failure handling and reconciliation before public launch.

Runtime dependencies audit clean. Seven high development-tool glob/lint findings remain; a forced incompatible downgrade is not used.

References: [OpenAI model and supported endpoints](https://developers.openai.com/api/docs/models/gpt-4.1-mini), [xAI API](https://docs.x.ai/developers/rest-api-reference/inference/chat-completions), [Stripe webhooks](https://docs.stripe.com/webhooks), [Railway IaC](https://docs.railway.com/infrastructure-as-code).
