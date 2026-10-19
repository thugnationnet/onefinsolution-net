# Stripe Embedded Checkout Integration

The Software storefront and Chat subscriptions now use embedded Stripe Checkout Sessions. Workspace credit checkout remains a separate billing module and is unchanged.

## Values to Replace

There are no product or key placeholders in the implementation:

- Software product and payment amounts are validated server-side. Checkout uses each catalog Stripe Product ID with dynamic `price_data` so installment amounts can vary without creating duplicate Products.
- The live Stripe catalog contains 12 Software products and 51 templates, each with an active USD Price and stable lookup key. Run `npm run stripe:provision-software -- --live` to reconcile the catalog and generate the complete `STRIPE_SOFTWARE_CATALOG` mapping.
- Stripe credentials are read from deployment environment variables and are not stored in source code.

## Configured Parameters

**Files containing the Checkout Session and embedded form configuration:**

- [app/software/checkout/actions.ts](./app/software/checkout/actions.ts)
- [app/software/checkout/CheckoutForm.tsx](./app/software/checkout/CheckoutForm.tsx)
- [lib/subscription-enrollment.ts](./lib/subscription-enrollment.ts)
- [components/subscription-form.tsx](./components/subscription-form.tsx)

| Parameter | Value |
|-----------|-------|
| `ui_mode` | `form` |
| `mode` | `payment` |
| `customer_update.name` | `auto` (required for Tax ID collection on an existing Customer) |
| `billing_address_collection` | `auto` |
| `phone_number_collection.enabled` | `false` |
| `automatic_tax.enabled` | `false` |
| `submit_type` | `auto` |
| `tax_id_collection.enabled` | `true` |
| `tax_id_collection.required` | Stripe default (`never`); Tax ID collection enabled and optional |
| `name_collection.individual` | Enabled, optional |
| `name_collection.business` | Enabled, optional |
| `saved_payment_method_options.payment_method_save` | `enabled` |
| `integration_identifier` | `custom_embedded_web_0001` |
| `payment_intent_data.setup_future_usage` | `off_session` |
| `line_items` | Selected catalog Product ID with server-generated amount and currency; falls back to inline product data when no catalog mapping is configured |
| `return_url` | Software payment completion page |
| Checkout Form layout | `expanded` |
| Stripe.js | Loaded from `https://js.stripe.com/dahlia/stripe.js` |

`payment_method_collection` is not explicitly set for this one-time payment Session. Stripe collects the payment method by default; the configured `always` value applies only to subscription Sessions.

Tax ID collection is enabled but optional. Stripe rejects `tax_id_collection.required: 'if_supported'` when business-name collection is optional, so the Checkout Session leaves the `required` option unset.

### Chat subscriptions

| Parameter | Value |
|-----------|-------|
| `ui_mode` | `form` |
| `mode` | `subscription` |
| `line_items` | Approved recurring Price ID selected from the configured subscription catalog |
| `billing_address_collection` | `auto` |
| `payment_method_collection` | `always` |
| `submit_type` | `auto` |
| `integration_identifier` | `custom_embedded_web_0002` |
| `saved_payment_method_options.payment_method_save` | `enabled` |
| `subscription_data` | Subscription metadata and configured trial settings when selected |
| `return_url` | `/subscribe/return?session_id={CHECKOUT_SESSION_ID}` |
| Checkout Form layout | `expanded` |
| Stripe.js | Loaded from `https://js.stripe.com/dahlia/stripe.js` |

Subscriptions continue to use Stripe Billing for recurring invoices and renewals; the embedded Checkout Form only replaces the enrollment/initial checkout UI.

## Setup and Next Steps

1. Configure `STRIPE_MODE`, `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, and `NEXT_PUBLIC_SITE_URL` in the deployment environment. Ensure the secret and publishable keys use the same test/live mode.
2. Register the Stripe webhook endpoint at `/api/stripe/webhook` and enable at least `payment_intent.succeeded`, `payment_intent.payment_failed`, and `payment_intent.canceled`.
3. Keep Software, Workspace, and subscription Customers isolated in their respective billing scopes. Software Customer IDs are stored in `software_billing_customers`; subscription Customer IDs are stored in `billing_customers`.
4. After provisioning live Software catalog items, run `node scripts/sync-live-stripe-to-railway.mjs` to deploy the generated full catalog mapping. Railway CLI authentication is required.
5. Test in Stripe test mode before enabling live keys. Stripe test card `4242 4242 4242 4242` can be used with a future expiry, any CVC, and any valid postal code. Use Stripe's documented test cards for authentication-required and declined-payment cases.
6. Verify a successful purchase appears in the Software account and that its saved card is visible under Software payment methods. Workspace cards and subscription billing should remain unaffected.

The installed Stripe server SDK and API version already support Checkout `ui_mode: "form"`; no dependency or API-version upgrade is needed for this implementation.

## Flow Overview

The signed-in buyer selects a Software product and amount. The server validates the purchase, associates it with the Software-scoped Stripe Customer, creates a payment-mode Checkout Session, and returns its client secret. For subscriptions, the server resolves the approved recurring Price and creates a subscription-mode Session on the subscription-scoped Customer, preserving trial eligibility and preventing duplicate active enrollments. Stripe.js renders the embedded form for each flow. After confirmation, the app verifies the session and uses existing webhook/return fulfillment. Stripe Billing manages recurring subscription invoices and renewals.
