> Implementation update October 10, 2026: the personal subscription flow uses custom Elements with SetupIntents, trials, homepage-chat-only memberships, renewal-scheduled changes, and the One Fin billing-email outbox. The authenticated Workspace uses a separate one-time credit purchase and usage ledger; neither payment path grants access or balance in the other product. Automatic and scheduled Workspace reloads remain deferred. [Current implementation and remaining configuration](PLANS-AND-WORKSPACE.md). Connect and standalone B2B invoicing remain deferred. The findings below record the earlier review.

# One Fin Stripe integration plan and review

Historical review from 2026-10-10. Target site origin for the current migration: `https://onefinsolution.net`. This document describes an earlier account setup and is not authoritative for the replacement Stripe account.

## Connection and scope

Account, product, price, webhook, and planner identifiers from that setup have been removed from tracked files. This repository cleanup did not modify Stripe or Railway resources, database records, customer records, or subscriptions.

Merchant confirmed BOTH own software sales and independent sellers receiving payouts, plus separate B2B invoices with deadlines.

Merchant correction: checkout and account management must run on One Fin's own domain with custom UI. Do not use Stripe Checkout, hosted payment pages, or Customer Portal. All merchant transactional emails must be sent by One Fin's own email infrastructure. Global sales and seller coverage are intended; actual supported countries, currencies and payout corridors must be verified before enabling each market. These requirements supersede earlier hosted Checkout and Stripe email recommendations, including those in STRIPE-SETUP.md.

## Product plan

| Product | Integration path | Current coverage |
| --- | --- | --- |
| Payments | Custom One Fin page with Stripe.js Payment Element and PaymentIntents; server-approved amount, currency and authenticated customer | Existing hosted Checkout implementation must be replaced |
| Billing | Subscription APIs with on-domain payment confirmation, paid-invoice allowance grants, renewal-scheduled changes and cancellation at period end | Existing fixed-credit plans; checkout entry point needs replacement |
| Invoicing | Authorized server workflow creates and finalizes invoices with agreed deadlines; One Fin emails its own secure payment link and confirms invoice-associated payments on-domain | Subscription invoices handled; standalone invoices currently ignored |
| Connect | Separate seller onboarding, account mappings, order ownership, payment and transfer ledger, refunds/disputes, capability checks and account-scoped webhook processing | No seller onboarding, connected accounts, split payments or payouts implemented |

Own software sales should continue to use the platform's own customer and payment records. Marketplace transactions need explicit seller/account scope; do not reuse the current customer-only fulfillment path as marketplace fulfillment. Select the Connect charge pattern after defining who sells to the buyer, how many sellers share a transaction, and who bears fees and losses. Prefer Stripe-provided onboarding rather than collecting seller identity documents in this app.

For B2B invoices, persist the invoice-to-order and customer mapping, scope actions to authorized business staff, and make creation, finalization and One Fin email delivery retries idempotent. Do not call Stripe's send-invoice email workflow. Define negotiated due days and supported payment methods. Use the invoice-associated payment flow from the current API; an unrelated successful PaymentIntent must not be assumed to settle an invoice. Verify paid state before granting an entitlement, including delayed payment methods. Issuance or a browser redirect alone must not fulfill an order. Distinguish operationally marking an invoice paid outside Stripe from collecting funds through Stripe.

Use SetupIntents and on-domain Elements for payment-method updates. Queue One Fin receipts, invoice notices, renewal/failure reminders and refund notices through an idempotent transactional outbox with delivery retries. Audit and disable optional Stripe customer receipt/invoice/recovery emails before launch. Do not promise to suppress legally required payment-provider or bank authentication messages. Bank/3DS authentication may require an external redirect even when the checkout page remains on One Fin's domain.

## Review findings

1. **Connect and standalone invoicing are missing.** `lib/stripe-fulfillment.ts` requires subscription metadata for `invoice.paid`; standalone B2B invoices return without fulfillment. This is appropriate for the current credit product but must be extended with explicit managed invoice/order routing for the new model.
2. **Refund/dispute policy is missing.** Current fulfillment handles paid packs, paid subscription invoices and subscription state, but does not reconcile refunds or disputes. Define how refunded licenses and already-spent credits behave before implementation; preserve historical ledger entries and avoid duplicate entitlement revocations.
3. **Failed-renewal recovery and payment-method updates need completion.** `invoice.payment_failed` has no handler and is absent from provisioned webhook events. Current account management supports cancellation and plan changes, not payment-method updates. Build payment-method management on-domain using SetupIntents. Route payment failure/recovery notifications through One Fin's email outbox. Verify retry settings and disable optional Stripe customer emails; do not introduce Customer Portal.
4. **Provisioning can leave partial resources.** `scripts/provision-stripe.mjs` creates products/prices before validating the site URL and inspecting webhook compatibility. The webhook listing uses a single page, and a generated-secret file conflict can fail after remote creation. Move local and read-only validation ahead of mutations, paginate endpoints, and define recovery for a newly created webhook whose one-time secret cannot be persisted.
5. **Tests do not prove actual payments.** Signature and fulfillment tests mock Stripe network calls. Real sandbox checkout, invoice collection, renewal, webhook retries, seller onboarding and payout behavior remain unverified.

Confirmed strengths: server-only Stripe client, expected-account/Test-mode checks, authenticated customer mapping, raw-body signature verification, stable grant references, paid-state checks, expiring subscription credits, and renewal schedules without proration. Hosted Checkout omits a hardcoded payment-method list.

Validation: all 19 repository tests passed; TypeScript typecheck passed. No runtime code was changed in this review.

## Decisions required before implementing the added flows

- Seller countries and currencies, and whether one order can contain multiple sellers.
- Whether sellers or One Fin are the merchant selling to the buyer; platform fee amount or percentage; responsibility for refunds, disputes and negative balances.
- B2B payment deadlines, billing contact/details, and entitlement granted by each software/license SKU.
- Approved business pricing versus the existing USD Test defaults.
- Tax registrations and collection obligations. No automatic tax setting was enabled or assumed.

## Implementation order

1. Rotate the disclosed Test secret, configure the replacement securely, and verify exact account/mode. MCP authentication remains separate from the application API key.
2. Replace hosted Checkout with the custom on-domain Payment Element/PaymentIntents and subscription API flow; update fulfillment to process verified PaymentIntent success for one-time orders without duplicate grants. Harden provisioning preflight and verify sandbox payments using the catalog only where it matches the intended product.
3. Add explicit orders/licenses and standalone invoice reconciliation with authorized staff actions and agreed payment deadlines.
4. Implement Connect onboarding and account-scoped payments/transfers after choosing the charge pattern and liability model.
5. Verify refunds, disputes, delayed and failed payments, webhook retries, tenant isolation and payouts in sandbox before considering Live deployment.

References:

- https://docs.stripe.com/mcp.md
- https://docs.stripe.com/connect/charges
- https://docs.stripe.com/invoicing/integration
- https://docs.stripe.com/customer-management/integrate-customer-portal
- https://docs.stripe.com/keys-best-practices
- https://docs.stripe.com/payments/payment-element
- https://docs.stripe.com/connect/cross-border-payouts
