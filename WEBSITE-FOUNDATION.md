# Website foundation

The homepage opens directly into the subscription-gated chat UI. Its chat sidebar is rendered only on `/`; all other public/account routes use the shared One Fin header, page content, and footer. `/workspace` has its own authenticated application shell without the homepage chat sidebar or public header/footer. It presents Workspace tasks, credit balance and activity, one-time credit checkout, saved payment-method settings, and transaction history. Workspace operations reserve credits and refund failed work. Automatic and scheduled reloads are not enabled. The legacy `/chat` route redirects to the homepage. The public site also includes Contact, searchable Help Center, Pricing, Privacy, Terms, and Payment/Cancellation/Refund Policy. Password recovery, sign-in, signup, and email confirmation use the existing authentication service.

Pricing shows Daily USD 5, Weekly USD 13, Monthly USD 30, Yearly USD 249, and Business contact sales. Card-backed trials last 1, 2, 3, and 5 days respectively. Memberships grant homepage-chat access only and never grant Workspace credits. Workspace credits are a separate one-time purchase and do not grant a chat subscription. See [Plans and workspace](billing/PLANS-AND-WORKSPACE.md) for the payment flow and operational prerequisites. Stripe remains sandbox-only.

## Account features

- `/dashboard`: Workspace credit balance and activity, counts, recent conversations, and homepage chat plan snapshot.
- `/dashboard/activity`: conversation search, reopen, and explicit-confirmation deletion.
- `/dashboard/billing`: homepage chat subscription history and cancellation/reactivation through existing server ownership checks. Workspace purchases are managed separately.
- `/dashboard/support`: only requests linked to the authenticated user, with status and staff response.
- `/account`: name, unique username, website, verified email, and sign-out.
- `/account/preferences`: database-backed appearance, time zone, Enter-to-send, spellcheck, saved-context attachment, and optional product-update preference.
- `/account/plugins`: actual built-in tools and model preferences; unconnected third-party plugins are identified honestly.
- `/account/security`: current-password-verified password changes and revocation of other sessions. Password changes revoke all sessions and outstanding reset tokens.
- `/account/privacy`: scoped JSON export, content-management links, and verified-ownership account-deletion request.

The shared header and chat tools read account status and preferences from one uncached, session-scoped GET endpoint. Navigation cancels stale reads, so background account refreshes do not enter the server-action queue used to save forms.

## Storage and operations

Run `npm run db:migrate` before serving the updated app. Migration `003_website_foundation.sql` adds account settings and support requests, with row-level isolation. Migration `005_workspace_credits.sql` adds separate homepage-chat usage, Workspace purchase, transaction, and saved-card metadata records. The health endpoint requires all five migrations.

Support requests are stored in `support_requests`, protected by server validation and rate limits. Guest requests are not linked to an existing account merely because the email matches. Authorized database operators can update `status` (`open`, `in_progress`, `resolved`) and `response`; users can only read their own tickets. The UI confirms recording, not email delivery. Staff administration and automated support notifications are not implemented.

SMTP configuration remains necessary for signup confirmation and password-reset email. Required names are `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `EMAIL_FROM`. No external delivery is claimed without verifying it. One Fin sends account email through its own configured provider.

Legal content describes the implemented service and keeps mandatory consumer rights intact. It is not a certification of worldwide legal compliance. Confirm business-specific retention, licensing terms, tax treatment, and contact disclosures before accepting Live purchases. Primary reference for data rights: https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng.

## Verification

`npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.

Earlier website checks predate the authenticated Workspace and strict subscription/credit separation. Re-run the relevant backend, typecheck, lint, production build, and updated route/browser checks against the current implementation before release.

After building: `npx playwright install chromium --only-shell`, then `npm run test:website`. The browser suite starts an isolated local PostgreSQL 16 database and app, seeds synthetic users, and exercises public pages, responsive navigation, account forms, recovery, tenant-scoped exports and support, and real preference behavior. It never uses Railway or payment/AI providers. Screenshots and local logs go to ignored `.test-artifacts/website/`.

The browser suite uses embedded-postgres to run real PostgreSQL locally. It keeps fixture data in ignored .test-artifacts/website/ and never connects to the production database. A local browser test does not establish inbox delivery or payment processing.
