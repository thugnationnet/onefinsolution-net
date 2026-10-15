# Infrastructure migration — onefinsolution.net

Controlled move of domain and service accounts. Application behavior, schema, pricing logic, and UX stay the same.

## Target

| Item | Value |
|------|--------|
| Domain | `https://onefinsolution.net` |
| GitHub | `https://github.com/thugnationnet/onefinsolution-net` |
| Stripe webhook | `https://onefinsolution.net/api/stripe/webhook` |
| Health | `https://onefinsolution.net/api/health` |
| Email domain | `onefinsolution.net` (Resend) |

## Already handled in repo source

- Site URL helpers default to `https://onefinsolution.net`.
- Company / legal / email copy use the `.com` domain.
- Session cookies can use `SESSION_COOKIE_DOMAIN=onefinsolution.net` or derive the host from `NEXT_PUBLIC_SITE_URL`.
- Railway IaC partial points at the new GitHub repo and public host.
- No `onefinsolution.online` references remain in application source.
- Stripe catalog uses **lookup keys** (`onefin_v2_*`) rather than hardcoded price IDs, so a new Stripe account can be provisioned without redesigning plans.

## Required secrets (never commit)

Set in Railway (production) and optionally `.env.local` (developer machines):

1. `DATABASE_URL` — **existing** Postgres (do not create an empty DB and cut over).
2. `SESSION_SECRET`, `WORKSPACE_SIGNING_KEY`
3. `STRIPE_MODE`, `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
4. `STRIPE_WEBHOOK_SECRET` (from endpoint on the new domain)
5. `STRIPE_EXPECTED_ACCOUNT_ID` (acct_… from the new Stripe account)
6. `RESEND_API_KEY` (already configured locally; mirror in Railway)
7. Email from/reply variables (defaults match verified domain)

## Stripe account cutover

Stripe objects **do not** move between accounts.

### Test mode (done locally for (previous Stripe test account — credentials removed))

1. Keys + `STRIPE_EXPECTED_ACCOUNT_ID` stored only in gitignored `.env.local` (`STRIPE_MODE=test`).
2. Workspace credit pack provisioned (`npm run stripe:provision -- --apply`).
3. Personal plans provisioned with lookup keys `onefin_v2_daily|weekly|monthly|yearly` (`npm run stripe:provision:plans -- --apply`).
4. Webhook endpoint ensured at `https://onefinsolution.net/api/stripe/webhook`; signing secret merged into `.env.local` as `STRIPE_WEBHOOK_SECRET`.
5. `STRIPE_CREDIT_PLANS` merged into `.env.local` from generated output.

### Railway test-mode cutover (done for proactive-truth)

1. Stripe + Resend + session/site vars pushed via `npm run railway:configure -- --apply` (secrets only in Railway / gitignored local env).
2. Linked `DATABASE_URL` from Postgres plugin **preserved** (not overwritten from laptop).
3. Service redeployed; `https://onefinsolution.net` and `/api/health` return OK.

### Still required for live billing

1. When going live: create **live** mode keys/products (or re-run provision scripts with `STRIPE_MODE=live` + live secret key) and a live webhook signing secret; set `STRIPE_MODE=live` on Railway.
2. Confirm Dashboard webhook delivery (test events first, then live).
3. **Active customers on the old Stripe account** need a business transition plan (re-subscribe, grace access, or support-assisted migration). Do not delete local `billing_customers` / subscription rows.

## Resend

1. Domain `onefinsolution.net` verified (SPF/DKIM).
2. `RESEND_API_KEY` in Railway + local env.
3. From addresses:
   - `noreply@onefinsolution.net`
   - `auth@onefinsolution.net`
   - `billing@onefinsolution.net`
4. `npm run verify:resend` (optional `EMAIL_TEST_TO`).
5. Inbound mail is **not** provided by Resend sending verification; configure separately if required.


## Transactional email events (Resend)

| Event | Template | Trigger |
|------|----------|---------|
| Sign-up | `welcome` | `signUpAction` after session create |
| Login | `login_alert` | `signInAction` (IP + user-agent) |
| Email verify / reset / magic link | `forgot_password` / `password_reset` / `login_reminder` | `auth-service` tokens |
| Password changed | `password_reset` style notice | `sendPasswordChangedEmail` |
| Profile updated | `account_updated` | `updateProfileAction` |
| Subscription activated / renewed / canceled / expired | matching templates | Stripe webhook + `billing_notices` |
| Trial ending | `trial_reminder` | `customer.subscription.trial_will_end` |
| Invoice paid / payment failed / refund | payment templates | Stripe webhook notices |
| Workspace credits | `credit_purchase` | checkout / payment_intent fulfillment |
| Software purchase / failure | `software_purchase` / `software_payment_failed` | storefront fulfillment |

Delivery: Resend (`RESEND_API_KEY`) with optional SMTP fallback. Notices are durable via `billing_notices` + `/api/internal/maintenance` drain.

Verify locally: `npm run email:verify` and `npm run email:test-templates` (requires `EMAIL_TEST_TO`).


## Railway

| Item | Value |
|------|--------|
| Project name | `proactive-truth` |
| Project ID | `282c45f7-8064-46cb-9a5d-a7c0084403fd` |
| Environment | `production` (`1801cc68-16d2-4b82-a93c-0517681c4b55`) |
| App service | `onefinsolution-com` (`33902053-6c56-447f-b233-081ade1aebdd`) |
| Database | Postgres plugin (`postgres.railway.internal`) — keep linked `DATABASE_URL` |
| Custom domain | `onefinsolution.net` (Railway custom domain; DNS CNAME → `*.up.railway.app`) |

1. Link service source to `thugnationnet/onefinsolution-net` / `main` (fresh independent repo; no stingyguys history).
2. Custom domain `onefinsolution.net` (+ www redirect if desired) — **done**.
3. Attach **existing** Postgres or migrate data before switching `DATABASE_URL`. Prefer the Railway-linked private URL; `scripts/configure-railway.mjs` skips overwriting remote `DATABASE_URL` when present — **done** (linked URL preserved).
4. Store `RAILWAY_TOKEN` + project/service/environment IDs in gitignored `.env.local` only (never commit). Then:
   - `npm run railway:configure` (dry-run; key names only)
   - `npm run railway:configure -- --apply` — **done** (Stripe test + Resend + session/site).
5. Health `https://onefinsolution.net/api/health` — **OK** after redeploy.
6. Optional new SQL: `railway run --project=… --environment=… --service=… node scripts/migrate.mjs` (uses remote `DATABASE_URL`; laptop cannot reach `*.railway.internal`).

### Env vars expected on the app service

`NODE_ENV`, `BILLING_PROVIDER`, `NEXT_PUBLIC_SITE_URL`, `SESSION_COOKIE_DOMAIN`, `SESSION_SECRET`, `WORKSPACE_SIGNING_KEY`, `WORKSPACE_CREDIT_COST`, `SIGNUP_CREDITS`, `XAI_API_KEY`, `XAI_MODEL`, `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_FROM_AUTH`, `EMAIL_FROM_BILLING`, `EMAIL_REPLY_TO`, `STRIPE_MODE`, `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_EXPECTED_ACCOUNT_ID`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CREDIT_PLANS`, plus linked `DATABASE_URL`. Do not push `EMAIL_TEST_TO` or Railway token/IDs to the service.

## GitHub

Remote should be `origin https://github.com/thugnationnet/onefinsolution-net.git`. Deployments should track this repository only. Clean history — no connection to any prior stingyguys repo.

## Verification checklist

- [x] `https://onefinsolution.net` loads
- [x] `/api/health` → database connected
- [ ] Sign-up / sign-in / password reset emails arrive from `@onefinsolution.net`
- [ ] Subscription checkout (test mode) + webhook fulfillment
- [ ] Workspace credit purchase
- [ ] Software storefront checkout (if enabled)
- [ ] No client or server errors referencing `.online` or old Stripe account ids
- [ ] `npm run build` and relevant tests pass

## Non-goals

- No payment subdomains
- No second Stripe account client in-app
- No redesign of subscription / workspace / software modules
- No deletion of legacy software payment server without proof it is unused


### Software storefront pricing

- Catalog + HTML template storefront list prices are **$499–$999** (see `app/software/src/data/catalog.ts` and `templatesData.ts`).
- Checkout still uses **ad-hoc PaymentIntent amounts** (not Stripe Price IDs): minimum pay **$5** (500 cents), any amount up to remaining balance; unpaid remainder stays pending.
- Provision matching Stripe test Products/Prices (Dashboard correlation only): `npm run stripe:provision-software` → writes `.stripe-software-ids.json` and optional `STRIPE_SOFTWARE_CATALOG` env map.
- Do not commit `.stripe-software-ids.json` or secret env files.


## Workspace credits ($5–$500)

- Manual Add Credit and Auto-reload charges accept **$5–$500** per transaction (frontend + backend + DB bounds).
- Rate: **$1 = 10 credits** (historical $5 pack = 50 credits remains the default).
- Stripe PaymentIntents use ad-hoc amounts with `billing_scope=workspace` metadata (isolated `workspace_billing_customers`).
- Migration: `migrations/railway/016_workspace_credit_amount_limits.sql` adds `workspace_credit_settings.reload_amount_cents`.
- Auto-reload / scheduling still run via existing maintenance drain + `maybeAttemptWorkspaceAutoReload`.



## Saved payment methods (per module)

Each module keeps its own Stripe Customer and payment methods:
- Subscriptions → `billing_customers`
- Workspace → `workspace_billing_customers` + `workspace_credit_settings.payment_method_id`
- Software → `software_billing_customers`

Checkout UIs list saved cards with a default selection and allow adding a new card. Cards are never shared across modules.

## Workspace auto-reload

- Maintenance tick (`/api/internal/maintenance` from `scripts/start.mjs`) runs `runDueWorkspaceAutoReloads`.
- Credit spend finish also best-effort triggers `maybeAttemptWorkspaceAutoReload`.
- Charges use the configured `reload_amount_cents` ($5–$500) and the saved Workspace payment method.

## Software remaining balance

- `/software/account` shows **Pay remaining balance** for partial purchases via `createSoftwareBalancePaymentIntent`.

## Receipts

- Migration `017_payment_receipts.sql` adds `receipt_url` columns.
- Fulfillment stores Stripe charge `receipt_url` when present.
- Subscription invoices remain available on `/dashboard/billing` via Stripe hosted invoices.
