# Production cleanup report — 2026-10-16

## Summary

| Check | Result |
| --- | --- |
| **Typecheck** (`tsc --noEmit`) | **EXIT 0** |
| **Production build** (`npm run build`) | **EXIT 0** |
| Subscription / Workspace / Software paths | **Intact** (all critical files present; routes in build output) |
| Cleanup-related fixes during this pass | **None required** (build succeeded without code changes) |

Artifacts:
- `_archive/20261016-production-cleanup/build-out.txt` (full log + `BUILD_EXIT:0`)
- `_archive/20261016-production-cleanup/build-tail.txt` (last ~120 lines)
- `_archive/20261016-production-cleanup/typecheck-out.txt` (`TYPECHECK_EXIT:0`)
- `_archive/20261016-production-cleanup/README.md` (archive inventory notes)

---

## 1. What was archived under `_archive/20261016-production-cleanup`

| Folder / item | Contents (purpose) |
| --- | --- |
| `app-level-vite/` | Root-level Vite leftovers (`server.ts`, `vite.config.ts`, `package.json`, `bun.lock`) not used by Next production |
| `app-software-express/` | Standalone Express/Vite/Firebase software prototype (`server.ts`, `main.tsx`, firebase configs, `schema.sql`, lockfiles, etc.) — **not** the Next.js storefront |
| `billing-docs/` | Historical billing notes (`PLANS-AND-WORKSPACE.md`, `STRIPE-*.md`, `test-catalog.json`) |
| `components/` | Unused typo file `subcription-actions.tsx` |
| `migrations-legacy/` | Old `legacy/*.sql` + README (superseded by `migrations/railway/*`) |
| `root-junk/` | Agent dumps, e2e result txts, `.env.e2e*`, `tsconfig.tsbuildinfo`, old docs (`DEPLOYMENT.md`, `WEBSITE-FOUNDATION.md`), helper scripts |
| `scripts-oneoff/` | One-off / debug scripts (e2e runners, stripe ping, webhook debug, verify-payment-p\*, patch helpers, etc.) |
| `tmp-artifacts/` | Transient logs and patch scratch files |
| Build/typecheck logs | `build-out.txt`, `build-tail.txt`, `typecheck-out.txt`, `README.md` |

---

## 2. What was kept for the three payment modules

### A. Subscription (Home Page Chat Plus)
- `lib/stripe-billing.ts` — subscription Stripe customer
- `lib/billing-scope.ts` — `billing_scope: homepage`
- `lib/subscription-catalog.ts`
- `app/payment-method-actions.ts` — list / setup / save / default / remove / retry
- `components/payment-methods-panel.tsx` — “Home Page Chat Plus payment methods”
- `components/settings-modal.tsx`, `app/dashboard/billing/page.tsx`, `app/account/page.tsx`
- Route: `/subscribe`, `/dashboard/billing`

### B. Workspace credits (+ auto-reload)
- `lib/workspace-stripe.ts` — isolated workspace Stripe customer
- `lib/workspace-auto-reload.ts` — `maybeAttemptWorkspaceAutoReload` / batch runner
- `app/workspace-actions.ts` — PM + credits + `setWorkspaceAutoReloadSettings`
- `components/workspace-application.tsx` — auto-reload UI panel
- `components/workspace-credit-checkout.tsx`
- `components/workspace-payment-methods-panel.tsx` (panel exists; dedicated mount still optional)
- `app/api/internal/maintenance/route.ts` — cron/batch auto-reload
- Route: `/workspace`, `/api/workspace`

### C. Software storefront
- Next app routes under `app/software/` (page, account, checkout, template-preview, src catalog/UI)
- `lib/software-stripe.ts`, `lib/software-purchase.ts`, `lib/software-refund.ts`
- `lib/software-storefront-fulfillment.ts`, `lib/software-billing-profile.ts`
- `app/software/checkout/actions.ts`, `CheckoutForm.tsx`, account billing managers
- Shared webhook: `app/api/stripe/webhook/route.ts`
- Routes in build: `/software`, `/software/account`, `/software/checkout`, `/software/checkout/complete`, `/software/template-preview/[filename]`

### Shared / ops kept
- `scripts/start.mjs`, `scripts/migrate.mjs`, provision/configure/verify scripts
- `migrations/railway/*` (active schema)
- `billing/personal-plan-ids.json` (when present)
- Root `package.json` production scripts only (no archived one-offs)

---

## 3. Typecheck result

```
> tsc --noEmit
TYPECHECK_EXIT:0
```

---

## 4. Build result

```
npm run build
… Compiled successfully …
… routes including /subscribe, /workspace, /software*, /dashboard/billing, /account …
BUILD_EXIT:0
```

`.next/` produced successfully (manifests present). No cleanup-related compile failures; no source fixes applied in this pass.

---

## 5. Confirmation — paths intact (key files)

All of the following were verified **present** after cleanup:

| Module | Key files |
| --- | --- |
| Subscription | `lib/stripe-billing.ts`, `lib/billing-scope.ts`, `lib/subscription-catalog.ts`, `app/payment-method-actions.ts`, `components/payment-methods-panel.tsx`, `app/dashboard/billing/page.tsx` |
| Workspace | `lib/workspace-stripe.ts`, `lib/workspace-auto-reload.ts`, `app/workspace-actions.ts`, `components/workspace-application.tsx`, `components/workspace-credit-checkout.tsx`, `components/workspace-payment-methods-panel.tsx`, `app/api/internal/maintenance/route.ts` |
| Software | `app/software/page.tsx`, `app/software/account/*`, `app/software/checkout/*`, `app/software/src/*`, `lib/software-stripe.ts`, `lib/software-purchase.ts`, `lib/software-refund.ts`, `lib/software-storefront-fulfillment.ts`, `lib/software-billing-profile.ts` |
| Shared | `app/api/stripe/webhook/route.ts`, `app/account/page.tsx`, `start.mjs` / `scripts/start.mjs`, `package.json` |

Build route table includes: `/account`, `/dashboard/billing`, `/subscribe`, `/workspace`, `/software`, `/software/account`, `/software/checkout`, `/software/checkout/complete`.

---

## 6. Confirmations requested

### 1. Typecheck exit
**0**

### 2. Build exit
**0**

### 3. `app/software` remaining
Top-level:
- `page.tsx`, `tsconfig.json`
- `account/` — `page.tsx`, `SoftwareBillingManager.tsx`, `SoftwareRemainingPay.tsx`, CSS
- `checkout/` — `page.tsx`, `actions.ts`, `CheckoutForm.tsx`, `complete/page.tsx`, CSS
- `public/images/` — logo + background
- `src/` — `App.tsx`, components, `data/catalog.ts` + templates, HTML previews, styles
- `template-preview/[filename]/page.tsx`

(Express/Vite/Firebase prototype **removed** from live tree → archived as `app-software-express/`.)

### 4. `scripts` remaining
```
configure-railway.mjs
configure-workspace-runtime.mjs
migrate.mjs
provision-payment-catalog.mjs
provision-personal-plans.mjs
provision-software-catalog.mjs
provision-stripe.mjs
start.mjs
verify-deployment.mjs
verify-resend-setup.mjs
```
(One-off e2e/debug scripts archived under `scripts-oneoff/`.)

### 5. Critical payment files still present
**Yes** — all Subscription, Workspace, and Software libs/actions/UI/webhook/maintenance files listed above: **OK**. No `MISS` entries in the post-cleanup presence check.

---

## Notes / assumptions

- Build was run from repo root; output captured under the archive folder as specified.
- `BUILD_EXIT:0` recorded after successful Next compile and `.next` generation (trace collection completed).
- No feature work and no intentional payment-behavior changes in this report pass.
- Scope isolation (homepage vs workspace vs software Stripe customers) remains as previously implemented; cleanup only moved non-production debris.
