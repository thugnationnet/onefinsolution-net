---
name: stripe-isolation
description: Enforces strict payment-method and Stripe Customer isolation between Subscription, Workspace Credits, and Software Purchasing systems.
when-to-use: isolation, payment method, customer mapping, billing_customers, cross-system
user-invocable: true
---

# Payment-Method Isolation Rules

### Required Mappings
- Subscriptions → `billing_customers`
- Workspace Credits → `workspace_billing_customers`
- Software Purchasing → `software_billing_customers`

### Hard Rules
1. Always resolve Stripe Customer ID from the authenticated user’s server-side mapping for the correct system.
2. Never trust a Customer ID or PaymentMethod ID coming from the frontend.
3. A card saved in one system must never appear or be usable in another system.
4. Every list / add / set-default / detach / charge operation must use the correct Customer mapping.
5. Check for accidental duplicate Stripe Customer IDs across the three tables.
6. Never silently reassign or delete historical payment records.
7. Metadata must stay consistent with the correct billing scope.

The same human user may have three different Stripe Customer IDs — that is intentional and required.
