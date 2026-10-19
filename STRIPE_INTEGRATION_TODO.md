# Stripe Embedded Checkout Integration

The Software storefront now creates an embedded Checkout Session for each initial product payment. Workspace credit checkout and Chat subscriptions remain separate billing modules and are not changed by this Software implementation.

## Values to Replace

There are no product or key placeholders in the implementation:

- Software product and payment amounts are validated server-side and sent as dynamic `price_data`; no sample `price_...` value is used.
- Stripe credentials are read from deployment environment variables and are not stored in source code.

## Configured Parameters

**Files containing the Checkout Session and embedded form configuration:**

- [app/software/checkout/actions.ts](./app/software/checkout/actions.ts)
- [app/software/checkout/CheckoutForm.tsx](./app/software/checkout/CheckoutForm.tsx)

| Parameter | Value |
|-----------|-------|
| `ui_mode` | `form` |
| `mode` | `payment` |
| `billing_address_collection` | `auto` |
| `phone_number_collection.enabled` | `false` |
| `automatic_tax.enabled` | `false` |
| `submit_type` | `auto` |
| `tax_id_collection.enabled` | `true` |
| `tax_id_collection.required` | `if_supported` |
| `name_collection.individual` | Enabled, optional |
| `name_collection.business` | Enabled, optional |
| `saved_payment_method_options.payment_method_save` | `enabled` |
| `integration_identifier` | `custom_embedded_web_0001` |
| `payment_intent_data.setup_future_usage` | `off_session` |
| `line_items` | Server-generated amount and currency for the selected Software product/payment |
| `return_url` | Software payment completion page |
| Checkout Form layout | `expanded` |
| Stripe.js | Loaded from `https://js.stripe.com/dahlia/stripe.js` |

`payment_method_collection` is not explicitly set for this one-time payment Session. Stripe collects the payment method by default; the configured `always` value applies only to subscription Sessions.

## Setup and Next Steps

1. Configure `STRIPE_MODE`, `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, and `NEXT_PUBLIC_SITE_URL` in the deployment environment. Ensure the secret and publishable keys use the same test/live mode.
2. Register the Stripe webhook endpoint at `/api/stripe/webhook` and enable at least `payment_intent.succeeded`, `payment_intent.payment_failed`, and `payment_intent.canceled`.
3. Keep Software billing isolated from Workspace and subscription billing. The Software Customer ID is stored in `software_billing_customers`; Checkout attaches a saved PaymentMethod to that Customer when the buyer chooses to save it.
4. Test in Stripe test mode before enabling live keys. Stripe test card `4242 4242 4242 4242` can be used with a future expiry, any CVC, and any valid postal code. Use Stripe's documented test cards for authentication-required and declined-payment cases.
5. Verify a successful purchase appears in the Software account and that its saved card is visible under Software payment methods. Workspace cards and subscription billing should remain unaffected.

The installed Stripe server SDK and API version already support Checkout `ui_mode: "form"`; no dependency or API-version upgrade is needed for this implementation.

## Flow Overview

The signed-in buyer selects a Software product and amount. The server validates the purchase, associates it with the Software-scoped Stripe Customer, creates a payment-mode Checkout Session, and returns its client secret. Stripe.js renders the embedded form. After confirmation, the app verifies the session/payment and uses the existing idempotent webhook fulfillment to update the purchase ledger.
