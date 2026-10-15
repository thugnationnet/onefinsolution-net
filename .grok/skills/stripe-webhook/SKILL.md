---
name: stripe-webhook
description: Rules for improving the central Stripe webhook handler – durable event ledger, idempotency, correct routing, and safe retries.
when-to-use: webhook, stripe webhook, event ledger, idempotent, duplicate event
user-invocable: true
---

# Webhook Reliability Rules

Keep the existing endpoint:
`app/api/stripe/webhook/route.ts`

### Required Improvements
1. Verify Stripe signature using the **raw body** + correct webhook secret.
2. Preserve existing test/live environment checks.
3. Add a durable webhook event ledger / inbox with unique Stripe event ID + processing state.
4. Handle duplicate deliveries safely.
5. Record processing failures so events can be retried.
6. Prevent duplicate credit grants, payments, orders, or fulfillment.
7. Route events to the correct payment system using validated data (not metadata alone).
8. Handle subscription lifecycle, invoice, credit, software purchase, checkout session, and refund events.
9. Never mark an event as successfully processed if required work failed.
10. Return proper retryable responses while guaranteeing completed events are never processed twice.

All database operations and Stripe API calls must be idempotent.
