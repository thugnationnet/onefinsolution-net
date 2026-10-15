---
name: stripe-payment-audit
description: Phase 1 – Verify the existing Stripe implementation against the audit findings. Always run this before making any code changes.
when-to-use: verify, audit, inspect current payment code, phase 1, check existing implementation
user-invocable: true
---

# Phase 1 — Verify Existing Implementation

Before writing any code:

1. Run `git status` and preserve all existing user changes.
2. Locate every payment route, service, action, database table, migration, and webhook handler.
3. Trace all three payment flows end-to-end:
   - Frontend request → Stripe → Database → Webhook → Dashboard
4. Verify the three Customer mappings and payment-method isolation.
5. Check which migrations have already been applied.
6. Inspect deployment configuration (do not change production settings).
7. Determine the status of the legacy Software payment server (`app/software/server.ts` etc.).
8. Review existing tests and note missing coverage.

### Rules
- Verify every audit finding against the real code.
- If something is already correctly implemented → leave it alone.
- Never expose Stripe keys, webhook secrets, or customer payment details.
- Report findings clearly before proposing any change.
