# Stripe Payment Architecture — Transfer Guide

**Source project:** `onefinsolution-net` (OneFin Solution)  
**Purpose:** Replicate the payment architecture in another company project without copying secrets or brand-specific credentials.  
**As of:** 2026-10-17 (main @ `96a3c51`)  
**Audience:** Engineers porting Subscription + Workspace Credits + Software Purchasing to a new product.

---

## 1. Architecture principles

### MUST rules (from `.grok/skills`)

| Skill | Non-negotiables |
| --- | --- |
| **stripe-payment-architecture** (master) | One main domain; **three separate payment modules**; different URL paths; **one shared Stripe client**; **one central webhook**; durable **event ledger** + idempotency; customer-facing UX without Stripe jargon; ship only after **code vs local vs production** verification. |
| **stripe-architecture** | Same domain, path-separated modules; shared client + env mode guard (`billing-environment.ts`); one webhook endpoint. |
| **stripe-isolation** | **No shared PaymentMethods or Customers across modules.** Each module owns its own Stripe Customer mapping. Reusing a customer ID across modules is a **bug**, not a convenience. |
| **stripe-webhook** | Central handler; durable ledger; claim → process → mark processed/failed; safe retries; all side effects idempotent. |
| **stripe-implementation-rules** | No secrets in git; no drive-by refactors; minimal diffs; never “fix production by guessing”; distinguish code intent vs local test vs production-verified behavior. |
| **project-conventions** | Server-only payment libs; App Router; keep business logic in `lib/`; thin route handlers. |

### Design pillars

1. **One product domain, three billable systems**  
   Same site (`onefinsolution.net`), separate URL trees and separate Stripe Customer rows per system.

2. **One Stripe account, one API client**  
   `lib/stripe.ts` — pinned API version, single secret key, livemode checks against `STRIPE_MODE`.

3. **Isolation by `billing_scope` metadata**  
   Every Customer / SetupIntent / Subscription / PaymentIntent / Checkout Session tags:
   - `billing_scope`: `subscription` | `workspace` | `software`
   - plus module-specific keys (`user_id`, product ids, etc.)

4. **Fulfillment is webhook-first**  
   UI may confirm client-side, but **ledger grants, access, refunds** settle in the webhook path (idempotent).

5. **Catalog is code + env, not hard-coded live price IDs in app logic**  
   Plans/templates define *what* to sell; provision scripts create Stripe Products/Prices; runtime resolves via **lookup_keys** and/or env JSON maps (`STRIPE_PERSONAL_PLANS`, `STRIPE_CREDIT_PLANS`, `STRIPE_SOFTWARE_CATALOG`).

6. **Customer UX language**  
   Never expose “off-session”, mandate, or raw Stripe object jargon in customer copy. Prefer “save card for next time”, trial lengths in plain days, clear product separation.

---

## 2. Module boundaries

### Overview

| Module | Scope key | Stripe Customer source | Primary UX | Charge style |
| --- | --- | --- | --- | --- |
| **Subscription** (chat / personal plans) | `subscription` | `lib/stripe-billing.ts` → `currentCustomer()` | `/pricing`, `/subscribe`, `/checkout/card` | Recurring Subscriptions (+ trial) via PaymentElement / subscription APIs |
| **Workspace Credits** | `workspace` | `lib/workspace-stripe.ts` → `workspaceCustomer()` | `/workspace`, `/checkout/credits` | **Hosted Checkout** one-time packs; optional auto-reload with saved PM |
| **Software Purchasing** | `software` | `lib/software-stripe.ts` → `softwareCustomer()` | `/software`, `/software/checkout` | PaymentElement PaymentIntents (templates + catalog software, deposits/remaining) |

### Isolation rules (implement exactly)

From `lib/billing-scope.ts`:

```ts
export type BillingScope = 'subscription' | 'workspace' | 'software';
```

- **Dedicated Customer per (user, scope).** DB tables map `user_id → stripe_customer_id` separately per module.
- **PaymentMethods never cross scopes.** A card saved on Subscription must not be charged for Workspace or Software without an explicit *new* setup under that scope’s customer.
- **Metadata on create:**
  - Customers: `billing_scope`, `user_id` (and app identifiers as needed)
  - Subscriptions / PIs / Checkout Sessions: `billing_scope` + product-specific metadata (`plan_key`, `credit_pack`, `software_item_id`, etc.)
- **Assert on read:** `assertCustomerMatchesScope(customer, scope)` before attach/charge.
- **Webhook routing:** branch on `event.type` **and** `billing_scope` (or equivalent metadata); software storefront has an extra early path for its PI metadata shape.

### Why three customers

Stripe Customers own PM lists, invoice state, and tax/shipping defaults. Sharing one customer would let a Workspace charge accidentally reuse a Subscription card (and mix invoice history). Isolation is intentional and required.

---

## 3. File map

### 3.1 Payment-related `lib/` (purpose one-liners)

| File | Purpose |
| --- | --- |
| `lib/stripe.ts` | Shared Stripe SDK client; pinned API version; secret key + livemode verification. |
| `lib/billing-environment.ts` | `STRIPE_MODE` (`test` \| `live`) and livemode match helpers. |
| `lib/billing-scope.ts` | Scope type, customer metadata helpers, PM readiness asserts, scope mismatch guards. |
| `lib/billing.ts` | Billing client facade; preserves real Stripe subscription ids (`sub_…`). |
| `lib/billing-currency.ts` | Multi-currency presentment (e.g. THB-settling account, USD presentment). |
| `lib/billing-notices.ts` | User-visible billing notice queue (email/in-app). |
| `lib/stripe-billing.ts` | **Subscription** module customer ensure/load. |
| `lib/subscription-catalog.ts` | Resolve managed plan Prices (lookup keys + currency). |
| `lib/subscription-enrollment.ts` | Start trial/paid enrollment; sets `trial_period_days` / `trial_end` from `plan.trialDays`. |
| `lib/subscription-access.ts` | Entitlement checks for chat subscription state. |
| `lib/plans.ts` | Canonical personal plan table (amounts, intervals, **trialDays**). |
| `lib/personal-plan-ids.ts` | Env-mapped Stripe product/price ids for personal plans. |
| `lib/stripe-fulfillment.ts` | Central fulfillment router for subscription + workspace (+ shared refund hooks). |
| `lib/stripe-webhook-ledger.ts` | Durable webhook event claim/process/fail ledger (idempotency). |
| `lib/credit-config.ts` | Parse `STRIPE_CREDIT_PLANS` JSON → credit pack definitions. |
| `lib/credits.ts` | Credit balance mutations; best-effort auto-reload trigger. |
| `lib/workspace-stripe.ts` | **Workspace** module customer ensure/load. |
| `lib/workspace-checkout.ts` | Hosted Checkout Sessions for credit packs (primary path). |
| `lib/workspace-credit-pack.ts` | Load default/min/max pack amounts from env + Stripe price. |
| `lib/workspace-credit-limits.ts` | Shared min/max purchase limits (client-safe). |
| `lib/workspace-auto-reload.ts` | Saved-card auto-reload settings (server); not customer-facing jargon. |
| `lib/workspace-billing-profile.ts` | Workspace billing profile DTO for UI. |
| `lib/software-stripe.ts` | **Software** module customer ensure/load. |
| `lib/software-purchase.ts` | Resolve template/software catalog items + amounts; optional `STRIPE_SOFTWARE_CATALOG` correlation. |
| `lib/software-storefront-fulfillment.ts` | Software PI success → purchase ledger + access. |
| `lib/software-refund.ts` | `charge.refunded` → software ledger adjustments. |
| `lib/software-billing-profile.ts` | Software billing profile DTO for account UI. |
| `lib/site-content.ts` | Marketing/help copy including trial 1/1/1/2 and product-separation FAQ. |

### 3.2 App routes (subscribe / pricing / workspace / software / checkout / webhooks)

**Pages**

| Path | Role |
| --- | --- |
| `app/pricing/page.tsx` | Public plan grid; trial copy from `plans` / site content. |
| `app/subscribe/page.tsx` | Subscription enroll entry. |
| `app/checkout/page.tsx` | Checkout hub / redirect shell. |
| `app/checkout/card/page.tsx` | Subscription card setup / pay (Elements). |
| `app/checkout/credits/page.tsx` | Workspace credits path (auth-gated → hosted Checkout). |
| `app/workspace/page.tsx` | Workspace console + credit purchase / payment settings. |
| `app/dashboard/billing/page.tsx` | Account billing overview. |
| `app/software/page.tsx` | Software storefront shell. |
| `app/software/checkout/page.tsx` | Software checkout (Elements). |
| `app/software/checkout/complete/page.tsx` | Post-payment completion. |
| `app/software/checkout/actions.ts` | Server actions: create PI / confirm amounts. |
| `app/software/checkout/CheckoutForm.tsx` | Client PaymentElement form. |
| `app/software/account/*` | Software billing manager + remaining balance pay. |
| `app/software/src/data/catalog.ts` | Curated software products (non-template). |
| `app/software/src/data/templatesData.ts` | `STOREFRONT_TEMPLATES` (HTML template SKUs). |
| `app/software/src/data/htmlTemplateFiles.ts` | Filename list aligned with provision script. |

**API**

| Path | Role |
| --- | --- |
| `app/api/stripe/webhook/route.ts` | **Single** Stripe webhook endpoint. |
| `app/api/workspace/route.ts` | Workspace API (balance / settings). |
| *(checkout session creation lives in lib + server actions, not only under `api/checkout`)* | Prefer `lib/workspace-checkout.ts` + software `actions.ts`. |

### 3.3 Middleware — domain canonicalization

`middleware.ts`:

- Builds canonical public origin from `HOST` / forwarded host / `NEXT_PUBLIC_SITE_URL`.
- **Force HTTPS** canonical host (production).
- Redirect **www → apex** (or configured primary host) so Stripe redirect URLs and cookies share one site.
- Auth redirect helper for gated routes (`/checkout/*`, workspace, etc.) — unauthenticated users get sign-in shell (empty HTML via curl is expected).
- Session cookie normalize (legacy cookie → current).

**Porting:** replace host allow-lists and `NEXT_PUBLIC_SITE_URL` with the new company domain; keep single-canonical-host behavior so Checkout `success_url` / `cancel_url` and webhook-configured endpoint stay stable.

### 3.4 Skills reference (in-repo)

```
.grok/skills/stripe-payment-architecture/SKILL.md
.grok/skills/stripe-architecture/SKILL.md
.grok/skills/stripe-isolation/SKILL.md
.grok/skills/stripe-webhook/SKILL.md
.grok/skills/stripe-implementation-rules/SKILL.md
.grok/skills/project-conventions/SKILL.md
```

Copy these into the target repo’s agent/skills folder so future edits keep the same guardrails.

---

## 4. Three modules — isolation detail

### 4.1 Subscription (chat / personal plans)

- **Customer:** `currentCustomer()` in `lib/stripe-billing.ts`.
- **Plans:** `lib/plans.ts` + Stripe Prices with lookup keys `onefin_v2_{daily|weekly|monthly|yearly}` (rename prefix on port).
- **Enrollment:** `prepareEnrollment(userId, planKey, 'trial' | 'paid')` uses `plan.trialDays` for `trial_period_days`.
- **PM:** Setup / subscription confirm via Elements on `/checkout/card`.
- **Fulfillment:** `customer.subscription.*`, `invoice.paid`, etc. inside `fulfillStripeEvent` when scope is subscription.
- **Access:** `subscription-access` gates homepage chat features — **not** Workspace and **not** Software downloads.

### 4.2 Workspace Credits

- **Customer:** `workspaceCustomer()` — separate row/customer.
- **Primary pay path:** Stripe **hosted Checkout** (`lib/workspace-checkout.ts`) to `pay.` custom domain or platform Checkout (this project uses Stripe custom domain `pay.onefinsolution.net` for Checkout; app remains on apex).
- **Packs:** amount bounds from `workspace-credit-limits` / env (`WORKSPACE_CREDIT_*`); price catalog via `STRIPE_CREDIT_PLANS` + provision scripts.
- **Auto-reload:** server-side off-session charge **allowed** for this module only, with a PM collected under the **workspace** customer; **UI copy must not say “off-session”** — use “automatic top-up” / “reload when balance is low”.
- **Fulfillment:** Checkout `checkout.session.completed` / PI succeeded → credit ledger grant (idempotent by payment id).

### 4.3 Software Purchasing

- **Customer:** `softwareCustomer()`.
- **Catalog sources:**
  1. `STOREFRONT_TEMPLATES` + HTML files (template SKUs)
  2. `softwareCatalog` curated apps
- **Stripe map:** `STRIPE_SOFTWARE_CATALOG` JSON from provision script: per-item `{ productId, priceId, lookupKey, … }` — **correlation / Dashboard hygiene**; charge amounts still validated in app logic.
- **Pay path:** PaymentElement PIs (full, deposit, remaining balance).
- **Fulfillment:** `fulfillSoftwareStorefrontPayment` + refunds via `software-refund`.
- **Access:** purchase ledger unlocks downloads/templates — independent of chat subscription.

### Metadata cheat-sheet

| Object | Required metadata |
| --- | --- |
| Customer | `billing_scope`, `user_id` |
| Subscription | `billing_scope=subscription`, `plan_key`, `user_id` |
| Checkout Session (credits) | `billing_scope=workspace`, pack/amount refs, `user_id` |
| PaymentIntent (software) | `billing_scope=software`, item id/kind, `user_id` |
| Prices (lookup) | Stable `lookup_key` per SKU; never rely on random Dashboard names in code |

---

## 5. Config values (safe to publish)

### 5.1 Trial config — `lib/plans.ts`

| key | name | amount (USD cents) | interval | trialDays |
| --- | --- | --- | --- | --- |
| `daily` | Daily | `500` ($5) | `day` | **1** |
| `weekly` | Weekly | `1300` ($13) | `week` | **1** |
| `monthly` | Monthly | `3000` ($30) | `month` | **1** |
| `yearly` | Yearly | `24900` ($249) | `year` | **2** |

Lookup key helper: `onefin_v2_${plan.key}` (change brand prefix when porting).

**UX copy fingerprint:** marketing/help text states **1-day / 1-day / 1-day / 2-day** trials (Daily/Weekly/Monthly/Yearly). Custom plans: `trialDays` 0 (no trial) unless explicitly configured.

### 5.2 Workspace credit limits (code defaults; env can override)

From workspace credit limit modules (names only — confirm in target env):

- Min / default / max purchase cents  
- Credits-per-dollar style cost via `WORKSPACE_CREDIT_COST`  
- Auto-reload threshold + reload amount settings (server)

### 5.3 Software catalog → Stripe IDs

**Not 42 arbitrary Dashboard products hand-typed in app code.** Mapping pipeline:

1. **Authoritative SKU lists in repo**
   - HTML templates: `scripts/provision-software-catalog.mjs` → `HTML_TEMPLATE_FILES` (**42** `.html` files) + price tiers array.
   - Plus curated software entries from `app/software/src/data/catalog.ts` / storefront data.
2. **Provision (idempotent)**  
   `node scripts/provision-software-catalog.mjs` [`--live`]  
   - Creates Product + one-time Price per template.  
   - `lookup_key` derived from sanitized filename/slug.  
   - Writes/prints `STRIPE_SOFTWARE_CATALOG` JSON:  
     `{ [itemId]: { productId, priceId, lookupKey, amountCents, … } }`.
3. **Runtime**  
   - UI/amount resolution: `lib/software-purchase.ts` reads `STOREFRONT_TEMPLATES` + `softwareCatalog`.  
   - Optional Stripe id correlation: `process.env.STRIPE_SOFTWARE_CATALOG`.  
   - PaymentIntent amount must match server-resolved cents (don’t trust client).

**Porting:** replace the 42 HTML assets and slugs; re-run provision; set new env JSON; do not copy OneFin price IDs.

---

## 6. Webhook architecture

### Single handler

`POST app/api/stripe/webhook/route.ts`

Flow:

1. Read raw body; `stripe.webhooks.constructEvent` with `STRIPE_WEBHOOK_SECRET`.
2. **Ledger claim** (`stripe-webhook-ledger`):  
   - new → `process`  
   - already processed → `skip` (2xx)  
   - in-flight/failed retry policy → reprocess or skip
3. Dispatch:
   - Software storefront PI metadata → `fulfillSoftwareStorefrontPayment`
   - Else → `fulfillStripeEvent` (subscription + workspace credits, refunds, etc.)
4. Mark processed **or** mark failed with error string (idempotent retries).

### Event ledger

`lib/stripe-webhook-ledger.ts` + DB table (migration via project migrate scripts):

- Unique `event_id` (Stripe `evt_…`)
- `attempts`, `status`, `error`, timestamps
- Prevents double-grant on Stripe retries

### Routing dimensions

1. `event.type` (`checkout.session.completed`, `payment_intent.succeeded`, `customer.subscription.updated`, `charge.refunded`, …)
2. `billing_scope` / metadata on the object
3. Software-specific metadata kind (`software-storefront`) short-circuit

**Ops:** one Railway/public URL endpoint; configure **both** test and live webhook endpoints/secrets when using two modes; never share test secret on live.

---

## 7. Environment variables (names only)

From `.env.example` (payment-relevant and supporting). **Do not commit values.**

**Core app / DB**

- `DATABASE_URL`
- `NEXT_PUBLIC_SITE_URL`
- `HOST` (if used)
- `WORKSPACE_SIGNING_KEY`
- `SESSION` / auth secrets as defined in example (copy full `.env.example` when porting)

**Billing mode**

- `BILLING_PROVIDER` (= `stripe`)
- `STRIPE_MODE` (`test` \| `live`)
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

**Catalog maps (JSON strings)**

- `STRIPE_PERSONAL_PLANS`
- `STRIPE_CREDIT_PLANS`
- `STRIPE_SOFTWARE_CATALOG`

**Workspace credit knobs** (as present in example / code)

- `WORKSPACE_CREDIT_COST`
- `WORKSPACE_CREDIT_MIN_AMOUNT_CENTS` (or project-specific names in `workspace-credit-limits`)
- `WORKSPACE_CREDIT_DEFAULT_AMOUNT_CENTS`
- `WORKSPACE_CREDIT_MAX_AMOUNT_CENTS`
- related auto-reload env if exposed

**Optional / platform**

- Resend/email keys for billing notices  
- OAuth/auth provider keys  
- Railway-specific config via `scripts/configure-railway.mjs`

---

## 8. Key UX rules

1. **No Stripe jargon for customers**  
   Banned in UI copy: “off-session”, “PaymentIntent”, “SetupIntent”, “mandate”, “idempotency key”.  
   Use: “save card”, “automatic top-up”, “trial”, “billed yearly”, etc.  
   (Commit `96a3c51` — *fix customer payment UX: drop Stripe jargon…*)

2. **Trial copy fingerprint 1 / 1 / 1 / 2**  
   Daily=1 day, Weekly=1 day, Monthly=1 day, Yearly=2 days. Keep `lib/plans.ts` and `lib/site-content.ts` aligned.

3. **Explain product separation**  
   Help center: chat subscription ≠ Workspace credits ≠ Software purchases.

4. **Auth gates**  
   Checkout routes redirect to sign-in; don’t treat empty curl HTML as a deploy failure.

5. **Workspace Checkout vs Elements**  
   Credits: hosted Checkout (low friction).  
   Card setup / software: Elements. Don’t force one pattern on all modules.

---

## 9. Provision & ops scripts (`scripts/`)

| Script | Role |
| --- | --- |
| `provision-payment-catalog.mjs` | Broad payment catalog provisioning (shared products/prices). |
| `provision-personal-plans.mjs` | Personal/chat plan Products+Prices from `plans` table; lookup keys; emits `STRIPE_PERSONAL_PLANS`. |
| `provision-live-stripe.mjs` | Live-mode provision wrapper / checklist-oriented live catalog. |
| `provision-software-catalog.mjs` | **42 templates** (+ catalog) → Products/Prices; emits `STRIPE_SOFTWARE_CATALOG`. |
| `provision-stripe-webhook.mjs` | Register/update webhook endpoint toward `/api/stripe/webhook`. |
| `configure-railway.mjs` | Railway service env wiring. |
| `configure-workspace-runtime.mjs` | Workspace runtime flags. |
| `apply-destination-details.mjs` | Stripe account destination/display details helper. |
| `migrate.mjs` | DB migrations (includes webhook ledger / billing tables). |
| `verify-deployment.mjs` | Post-deploy health checks. |
| `verify-resend-setup.mjs` | Email provider verify (billing notices). |
| `smoke-*.mjs` / `scripts/tests/*` | Smoke/idempotency tests where present. |

**Typical order (new company):**

1. Migrate DB  
2. Set `STRIPE_MODE=test` + test keys  
3. Provision personal plans → credit packs → software catalog  
4. Provision webhook to staging URL  
5. Local purchase smoke per module  
6. Flip live keys + live provision + live webhook  
7. Controlled real-card tests per module  

---

## 10. Deploy / ops checklist

- [ ] `STRIPE_MODE` matches key livemode (`test` keys only with `test`)
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` matches secret mode
- [ ] Webhook endpoint URL = `https://<canonical-domain>/api/stripe/webhook`
- [ ] Webhook secret installed; events include: Checkout completed, PI succeeded/failed, subscription lifecycle, invoice paid, charge refunded
- [ ] Canonical domain middleware (www/apex) matches Stripe Dashboard allowed redirects
- [ ] `STRIPE_*_PLANS` / `STRIPE_SOFTWARE_CATALOG` present for the active mode
- [ ] Trial days visible on `/pricing` match `plans.ts`
- [ ] Three isolated customers created on first use of each module (verify in Stripe Dashboard metadata)
- [ ] Webhook ledger table writable; duplicate delivery does not double-credit
- [ ] Customer UI: no off-session jargon; workspace auto-reload wording reviewed
- [ ] Auth on `/checkout/credits`, `/checkout/card`, `/software/checkout`
- [ ] Refund path tested for software + credits
- [ ] Railway/health: site Online; payment success_url lands on same canonical host

---

## 11. Porting checklist — “another company”

### Rename / replace

| OneFin artifact | Action |
| --- | --- |
| Domain `onefinsolution.net` / `.online` | New canonical domain + middleware allow-list + `NEXT_PUBLIC_SITE_URL` |
| Stripe custom domain `pay.onefinsolution.net` | Optional; recreate under new brand or use default Checkout domain |
| Lookup prefix `onefin_v2_` | New prefix e.g. `acme_v1_` |
| Brand copy in `lib/site-content.ts` | Rewrite FAQ/pricing |
| `plans.ts` amounts/trials | Business decision; keep structure |
| 42 HTML templates + `STOREFRONT_TEMPLATES` | Replace with company SKUs |
| `softwareCatalog` curated apps | Replace |
| Railway service name / docs saying `onefinsolution-com` | Update IaC docs |
| Email templates / Resend domain | New domain auth |
| Env JSON blobs | **Re-provision**; never copy live price IDs from OneFin |

### Keep as-is (patterns)

- Three-scope isolation + metadata  
- Single webhook + durable ledger  
- Shared `lib/stripe.ts` client + `billing-environment`  
- Hosted Checkout for credit packs; Elements for subscription card + software  
- Provision scripts pattern (idempotent lookup_keys)  
- Skills/MUST rules  

### Do **not** copy

- Any `.env`, `.env.local`, Railway secrets  
- Live `pk_` / `sk_` / webhook secrets  
- Real customer ids, PM ids  
- Production `STRIPE_SOFTWARE_CATALOG` values from OneFin  

### Minimal code skeleton to re-implement

```
lib/stripe.ts
lib/billing-environment.ts
lib/billing-scope.ts
lib/stripe-webhook-ledger.ts
lib/stripe-fulfillment.ts
lib/stripe-billing.ts          # scope: subscription
lib/workspace-stripe.ts        # scope: workspace
lib/software-stripe.ts         # scope: software
lib/subscription-enrollment.ts
lib/workspace-checkout.ts
lib/software-purchase.ts
lib/software-storefront-fulfillment.ts
app/api/stripe/webhook/route.ts
scripts/provision-*.mjs
```

### Acceptance tests per module

1. **Subscription:** trial enroll → webhook → access; cancel; paid enroll.  
2. **Workspace:** hosted Checkout credit grant once; replay webhook → still once; auto-reload only uses workspace PM.  
3. **Software:** template purchase unlock; refund reverses ledger; subscription customer PM **not** listed on software customer.

---

## 12. Commit timeline summary

Recent history (`git log --oneline -40`), newest first — payment architecture narrative:

| Commit | Date | Summary |
| --- | --- | --- |
| `96a3c51` | 2026-10-17 | **UX:** drop Stripe jargon / legacy customer payment wording |
| `9572933` | 2026-10-17 | **Trials:** daily/weekly/monthly=1, yearly=2; deploy pricing copy |
| *(intervening deploy/docs commits)* | 2026-10-16–17 | Railway domain, health, content alignment |
| `d01e218` / `7bc54cb` | 2026-10-16 | Refund handling; custom-plan guards; **billing isolation copy** |
| `a573956` | 2026-10-16 | Provision **test catalog** + **webhook event ledger** |
| Software fix series (`6ae5c20`, `1fc4702`, `0677b35`, …) | 2026-10-16 | Storefront template exports; refund SQL; item resolution |
| `46cdc40` / `8c192dd` | 2026-10-16 | Env + Stripe integration docs/temp device login files |
| `b845c60` | 2026-10-16 | Initial commit: onefinsolution.net |

**Arc:** bootstrap site → Stripe env + catalogs + webhook ledger → module isolation + software storefront correctness → refunds → trial duration product decision → customer-safe UX language.

Full message list for auditors:

```
96a3c51 fix customer payment UX: drop Stripe jargon and legacy
9572933 trials 1/1/1/2 + pricing copy (deployed)
… (domain/health/content)
d01e218 feat: refund handling + validation
7bc54cb Priority 2: software refunds, custom-plan guards, billing isolation copy
a573956 fix(billing): provision Stripe test catalog and webhook event ledger
6ae5c20 / 1fc4702 / 0677b35 software storefront export + refund SQL fixes
46cdc40 Update environment configuration and documentation for Stripe integration
b845c60 Initial commit: onefinsolution.net
```

*(Run `git log -40 --pretty=format:'%h %ad %s' --date=short` on the source repo for the exhaustive 40-line list when auditing.)*

---

## 13. Quick reference — request paths vs modules

```
/pricing  /subscribe  /checkout/card     → Subscription
/workspace  /checkout/credits            → Workspace Credits (hosted Checkout)
/software  /software/checkout            → Software Purchasing (Elements)
/api/stripe/webhook                      → All modules (ledger + route by metadata)
```

---

## 14. Document control

| Field | Value |
| --- | --- |
| Source repo path | `c:\Users\EliteHp\Documents\onefinsolution-net` |
| Guide path | `docs/STRIPE-PAYMENT-ARCHITECTURE-TRANSFER.md` |
| Secrets included | **None** |
| Related internal skills | `.grok/skills/stripe-*` |
| Production domains observed | `onefinsolution.net` (apex+www), Checkout `pay.onefinsolution.net` |

---

*End of transfer guide. Port patterns and structures; re-provision all Stripe objects and secrets under the new company’s Stripe account.*
