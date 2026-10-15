# Homepage chat subscriptions and Workspace credits

Implemented October 10, 2026. Stripe account-specific identifiers have been cleared for the migration.

| Plan | USD recurring price | Card-backed trial |
| --- | ---: | ---: |
| Daily | 5 / day | 1 day |
| Weekly | 13 / week | 3 days |
| Monthly | 30 / month | 5 days |
| Yearly | 249 / year | 15 days |

Personal memberships and trials grant access exclusively to the homepage chat during an active trial or verified paid period. They do not grant Workspace credits. Workspace is a separate authenticated application: completed Workspace tasks consume credits, which are purchased separately. Workspace credit purchases do not create or extend a chat subscription. Business is a separate contact-sales option; team workspaces are not included yet. New subscription prices use `onefin_v2_*` lookup keys; IDs are recorded in `personal-plan-ids.json`.

## Payment flow

`/subscribe` uses Stripe Payment Element at the origin configured by `NEXT_PUBLIC_SITE_URL` (target: `https://onefinsolution.net`). The production session cookie is host-only unless `SESSION_COOKIE_DOMAIN` is explicitly configured. A SetupIntent saves a card for off-session billing. The server checks authenticated customer ownership, successful setup, card type, and the selected server-approved price before creating a subscription. Consent and trial eligibility are persisted. There is one trial per account and card fingerprint across all plans. Only a keyed fingerprint hash is stored, never card numbers or CVC.

Enrollment request IDs and Stripe idempotency keys protect retries. Trial claims are committed before subscription creation so an ambiguous timeout cannot free the trial for another account. Retrying recovers the subscription through enrollment metadata. Requests unresolved after 23 hours require support review instead of risking a new charge after Stripe's idempotency window.

Subscriptions use automatic card collection and flexible billing. No hosted Checkout or Customer Portal is created. Card setup can require bank authentication. A zero-dollar trial invoice does not grant a paid term: verified card-backed trials grant only until trial expiry, and paid invoices extend access using the invoice line's own period end. Delayed older invoices cannot extend access into the latest unpaid period. Failed renewals do not extend access.

Plan changes use Subscription Schedules at the current period end, without proration. A trial change preserves the existing trial expiry and does not create another trial. Selecting the current plan removes a pending switch. Cancellation releases a managed pending schedule and stops renewal at period end. Payment-method updates and outstanding invoice recovery stay on-domain.

## Workspace credit flow

Workspace uses the existing credit ledger with atomic reservation and refund on failed AI tasks. The current fixed pack is 50 credits for USD 5, purchased as a one-time Stripe PaymentIntent. Verified PaymentIntent fulfillment grants the pack once and records an owner-scoped transaction. Subscription invoices never grant Workspace credits; a credit purchase never grants membership access. Saved cards are optional and do not authorize reloads. Automatic and scheduled reloads are intentionally not enabled.

Migration `005_workspace_credits.sql` adds separate chat usage, Workspace purchase, transaction, and saved-card metadata tables. The credit pack must be provisioned in the selected Stripe test account and the resulting `STRIPE_CREDIT_PLANS` mapping configured before checkout can work. Apply migrations before deployment. Existing account sessions expire absolutely after 30 days; activity does not extend them.

The homepage chat requires an active membership and records usage separately from the Workspace credit ledger. Workspace tasks require an authenticated user and available credits. Signup or legacy credit balances, if present, remain Workspace-only and do not replace a chat subscription.

## Deployment and configuration

Migration `004_trials_workspace.sql` adds isolated billing enrollment, trial claims, membership access, notice outbox, and visitor counters. `npm start` starts Next.js and a minute-based maintenance loop. The loop retries One Fin SMTP notices and reconciles abandoned visitor reservations. It authenticates to an internal endpoint with `WORKSPACE_SIGNING_KEY`; do not expose or rotate that key casually.

Runtime prerequisites:

- `STRIPE_SECRET_KEY`: Test secret, supplied through Railway secrets.
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`: matching Sandbox publishable key, required by the custom Stripe Elements checkout.
- `STRIPE_EXPECTED_ACCOUNT_ID`, `STRIPE_MODE=test`.
- `STRIPE_WEBHOOK_SECRET`: signing secret for the One Fin webhook.
- `WORKSPACE_SIGNING_KEY`: stable random 32+ character value.
- `OPENAI_API_KEY` or configured `XAI_API_KEY` for real responses.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` for account and billing email.

Optional Stripe receipt, trial, and recovery emails must be disabled in Stripe Dashboard before customer launch; One Fin uses its own outbox. Bank authentication messages are controlled by the bank. SMTP uses stable message IDs and retry leases; it is at-least-once delivery, not a guarantee against duplicate email after a delivery/commit failure.

`STRIPE_MODE` defaults to Test; production does not select Live implicitly. The old account's product/price IDs and webhook identifiers have been removed from the repository. No Stripe objects, Railway variables, subscriptions, or customer records were deleted. Configure the replacement Test account, products/prices, webhook, and exact Railway target before enabling checkout. No payment lifecycle has been claimed as tested for the replacement setup.

The Test provisioner and `STRIPE_CREDIT_PLANS` generator now accept Workspace one-time packs only. Homepage chat recurring prices remain provisioned and validated separately against the subscription catalog. Apply migration 005 and configure the AI provider before claiming live Workspace credit purchases or AI operation. No inbox delivery or real AI response is claimed until its prerequisites are verified.

## Verification and references

Verification: 24 backend tests (including the added 30-day session test) and 43 browser checks passed; production build, TypeScript and lint passed. External card charging, email delivery and AI generation remain unverified without runtime credentials.

Backend tests cover card-first trial activation, ambiguous Stripe response recovery, repeated card rejection, paid-access expiry, scheduled changes, invoice replay ordering, and the separation between membership access and Workspace credit reservations. Workspace purchase/webhook tests should verify idempotent pack fulfillment and owner-scoped history.

The custom Elements flow is retained. Stripe and Railway resource identifiers must be provisioned for the replacement accounts; existing customer and subscription records remain untouched.

- [Stripe SetupIntents](https://docs.stripe.com/api/setup_intents)
- [Stripe trials](https://docs.stripe.com/billing/subscriptions/trials/free-trials)
- [Subscription Schedules](https://docs.stripe.com/billing/subscriptions/subscription-schedules)
- [Railway trusted request headers](https://docs.railway.com/networking/public-networking/specs-and-limits)
