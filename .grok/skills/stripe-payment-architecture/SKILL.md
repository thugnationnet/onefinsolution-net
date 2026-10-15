---
name: stripe-payment-architecture
description: Master skill for the Stripe Payment Architecture audit and safe implementation task. Use this for the entire project. Enforces one main domain, three separate payment modules, shared Stripe client, payment-method isolation, and reliable webhook handling.
when-to-use: stripe, payment, billing, subscription, credits, software purchase, webhook, audit, architecture, payment system
user-invocable: true
---

# Stripe Payment Architecture — Audit-Based Improvements and Safe Implementation

## Project Context
Work **only** in the existing repository:
`C:\Users\EliteHp\Downloads\chatbot-template`

A read-only audit has already been completed. Your job is to:
1. Verify every audit finding against the real current code.
2. Implement only the confirmed improvements.
3. Preserve all existing working payment functionality.

### Absolute Rules (Never Break These)
- Do **not** rebuild the entire payment system from scratch.
- Do **not** create separate website domains or subdomains.
- Do **not** create multiple Stripe accounts or clients.
- Do **not** combine all payment logic into one large file.
- Do **not** delete or merge the legacy software payment server without verified proof it is unused.
- Do **not** expose any Stripe secret keys, webhook secrets, or customer payment details.
- Make changes incrementally. Prefer the smallest safe change.

## Required Target Architecture
- One existing main website domain
- Different URL paths for the three payment systems
- One shared Stripe account + one shared server-side Stripe client
- Three logically separate payment service modules
- Separate Stripe Customer mappings and saved payment methods for each system
- One central webhook endpoint with durable event ledger + idempotent processing
- Separate domain-specific business logic, database records, dashboards, and flows

## Three Payment Systems
1. **Subscription System** – plans, trials, renewals, upgrades/downgrades, invoices
2. **Workspace Credits System** – credit packs, balances, scheduled/auto reloads
3. **Software Purchasing System** – one-time purchases, deposits, outstanding balance, refunds

## Shared Customer Mappings (must stay isolated)
- `billing_customers` → Subscriptions
- `workspace_billing_customers` → Workspace Credits
- `software_billing_customers` → Software Purchasing

## Key Files You Must Inspect First
### Shared
- lib/stripe.ts
- lib/billing-environment.ts
- app/api/stripe/webhook/route.ts
- lib/stripe-fulfillment.ts

### Subscription
- lib/subscription-enrollment.ts
- lib/stripe-billing.ts
- lib/subscription-catalog.ts
- app/subscription-actions.ts
- app/billing-actions.ts
- app/payment-method-actions.ts
- app/dashboard/billing/page.tsx

### Workspace Credits
- lib/workspace-stripe.ts
- lib/credits.ts
- app/workspace-actions.ts
- app/credit-actions.ts
- app/workspace/page.tsx

### Software Purchasing
- lib/software-stripe.ts
- lib/software-purchase.ts
- lib/software-storefront-fulfillment.ts
- app/software/checkout/actions.ts
- app/software/account/page.tsx

### Database / Legacy
- migrations/railway/002_credits.sql
- migrations/railway/004_trials_workspace.sql
- migrations/railway/005_workspace_credits.sql
- migrations/railway/011_billing_scope_isolation.sql
- migrations/railway/012_software_storefront_purchases.sql
- app/software/server.ts
- app/software/schema.sql
- app/software/package.json
- app/server.ts

## Mandatory Working Order
1. Phase 1 – Verify current implementation (do this first, before any code change)
2. Phase 2 – Confirm one domain + different paths + three modules
3. Phase 3 – Enforce payment-method isolation
4. Phase 4 – Improve webhook reliability (durable ledger + idempotency)
5. Phase 5 – Subscription synchronization
6. Phase 6 – Workspace scheduled / auto-reload (only if product requirements support it)
7. Phase 7 – Correct Software purchase accounting (order total vs amount paid)
8. Phase 8 – Verify legacy software payment server (never delete without proof)
9. Phase 9 – Database migrations (only confirmed, backward-compatible ones)
10. Phase 10 – Automated tests for all changes

## Final Report Format (always produce this at the end)
1. Confirmed audit findings and their resolution
2. Files changed, grouped by payment system
3. Confirmation that main domain and existing URL paths were preserved
4. Confirmation that no subdomains or extra Stripe accounts were introduced
5. Database migrations created and whether they were executed
6. Tests, lint, type-check, and build results
7. Remaining issues / business decisions that need approval
8. Required environment / webhook / scheduling / deployment notes
9. Status of the legacy Software payment server
10. Clear distinction between code changes, locally tested behavior, and production-verified behavior
