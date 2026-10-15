> Migration note: homepage chat subscriptions use custom Stripe Elements, card-first trials, and next-renewal switching. Workspace credits use a separate one-time pack and PaymentIntent flow. The target site origin is `https://onefinsolution.net`. See [Plans and workspace](PLANS-AND-WORKSPACE.md) for pricing and runtime prerequisites. Account-specific Stripe identifiers have been cleared.

# Stripe setup continuation

Superseded architecture: the merchant subsequently required custom checkout on One Fin's domain, no Stripe Checkout or hosted payment pages, One Fin email delivery, and global sales. Follow this document's current-state notes and [Plans and workspace](PLANS-AND-WORKSPACE.md) for the current plan. The steps below describe the earlier hosted implementation and must not be treated as the target architecture.

Reviewed 2026-10-10 using the Stripe implementation planner.

- Historical integration: hosted Checkout, flat-rate monthly/annual subscriptions, and one-time credit packs.
- Signup: any configured signup credits belong to Workspace only and do not grant homepage chat access.
- Management: existing custom subscription UI/API; changes at renewal without proration and cancellation at period end.
- Recovery: Smart Retries and failed-payment emails recommended; account settings have not been verified or changed.
- Tax: business obligations and registrations remain unknown. No tax decision or collection setting was applied.

## Current verified state

The prior account-specific product, price, webhook, Railway project, service, and domain bindings have been cleared from tracked configuration. This cleanup did not call Stripe or Railway APIs, remove deployed variables, delete Stripe objects, or alter database/customer records. New Test objects and webhook must be provisioned in the replacement Stripe account and configured for the confirmed Railway target.

## Next setup steps

1. Configure the replacement account's matching Test secret and publishable keys in ignored `.env.local` (or the deployment secret store), together with its `STRIPE_EXPECTED_ACCOUNT_ID`, `STRIPE_MODE=test`, and `NEXT_PUBLIC_SITE_URL=https://onefinsolution.net`.
2. Run `node scripts/provision-stripe.mjs` to dry-run and verify the account, mode, and Workspace-only catalog against `billing/test-catalog.json`.
3. Only after reviewing and approving the external changes, run `node scripts/provision-stripe.mjs --apply` to provision the Workspace one-time credit-pack catalog and add the required events to a new Test webhook. Personal homepage-chat subscription prices are managed separately. Preserve a newly generated signing secret in the ignored generated file.
4. Configure the application with `BILLING_PROVIDER=stripe`, the exact generated Workspace-only `STRIPE_CREDIT_PLANS` mapping, matching Test publishable key, and `STRIPE_WEBHOOK_SECRET`. Follow `DEPLOYMENT.md` for Railway configuration.
5. Verify paid, declined, and cancelled Test credit-pack payments; duplicate webhook delivery; homepage chat subscription renewal, scheduled plan changes, and cancellation; and Workspace credit fulfillment. A successful redirect alone does not establish payment or fulfillment.

Use the existing test amounts only. Live pricing and deployment require separate business decisions and completed Test verification.

Planner reference: https://docs.stripe.com/billing/subscriptions/build-subscriptions?payment-ui=checkout&ui=stripe-hosted
