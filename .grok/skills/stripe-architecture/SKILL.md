---
name: stripe-architecture
description: Enforces the mandatory architecture: one main domain, different URL paths, three separate payment modules, one shared Stripe client.
when-to-use: architecture, domain, paths, modules, shared stripe client, structure
user-invocable: true
---

# Mandatory Architecture Rules

## A. One Main Domain Only
- Entire application stays on the existing main domain.
- Never create subdomains for subscription / workspace / software.

## B. Different URL Paths
- Keep existing routes wherever possible.
- Example shape (do not force if different):
  - /subscription/
  - /workspace/
  - /software/
- Never break authentication, redirects, checkout URLs, or dashboard links.

## C. Three Logically Separate Modules
Keep business logic separate:
1. Subscription System
2. Workspace Credits System
3. Software Purchasing System

Shared infrastructure is allowed (Stripe client, webhook router, common helpers).  
Business rules, pricing, payment methods, status transitions, and fulfillment must stay isolated.

## D. Shared Infrastructure
- One shared Stripe account
- One shared server-side Stripe client (`lib/stripe.ts` + `lib/billing-environment.ts`)
- One central webhook endpoint
