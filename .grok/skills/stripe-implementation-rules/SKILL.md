---
name: stripe-implementation-rules
description: Global implementation discipline for the Stripe payment task. Always follow these rules when writing or changing code.
when-to-use: implement, change code, write code, migration, test, final report
user-invocable: true
---

# Implementation Rules (Always Apply)

- Make changes **incrementally**.
- Preserve every existing working payment flow.
- Do not rebuild the Stripe integration from scratch.
- Do not create subdomains or extra Stripe accounts.
- Keep the three payment modules logically separate.
- Use the existing shared Stripe client.
- Preserve existing routes and checkout URLs unless a change is proven necessary.
- Preserve authentication, authorization, rate limits, pricing validation, idempotency, and ownership checks.
- Avoid unrelated UI redesigns or large refactors.
- Do **not** commit, push, deploy, or change production Stripe / Railway settings without explicit permission.
- Never claim something is fixed without test evidence.
- Clearly separate: code changes / locally tested / production-verified.
- Never expose secrets in logs or reports.
- If a business rule or deployment fact cannot be determined from the repo → stop and ask instead of guessing.

## Final Report (always produce)
1. Confirmed findings + resolution
2. Files changed (grouped by system)
3. Domain & path preservation confirmation
4. No extra subdomains / Stripe accounts confirmation
5. Migrations created + execution status
6. Test / lint / type-check / build results
7. Remaining open decisions
8. Environment / webhook / scheduling notes
9. Legacy software server status
10. Code vs local test vs production distinction
