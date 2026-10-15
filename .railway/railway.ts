import { defineRailway, project, service, preserve } from "railway/iac";

// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// Prefer preserving an existing linked Postgres volume over allocating a new
// empty database (which would drop subscription/workspace history).
const onefinWeb = service({
  name: "onefin-web",
  source: {
    type: "github",
    repo: "thugnationnet/onefinsolution-net",
    branch: "main",
  },
  networking: {
    publicHost: "onefinsolution.net",
  },
  config: {
    builder: "RAILPACK",
    buildCommand: "npm run build",
    startCommand: "npm run start",
    healthcheckPath: "/api/health",
  },
  variables: {
    NODE_ENV: "production",
    BILLING_PROVIDER: "stripe",
    NEXT_PUBLIC_SITE_URL: "https://onefinsolution.net",
    SESSION_COOKIE_DOMAIN: "onefinsolution.net",
    EMAIL_FROM: "One Fin Solution <noreply@onefinsolution.net>",
    EMAIL_FROM_AUTH: "One Fin Solution Auth <auth@onefinsolution.net>",
    EMAIL_FROM_BILLING: "One Fin Solution Billing <billing@onefinsolution.net>",
    EMAIL_REPLY_TO: "support@onefinsolution.net",
    // Secrets / account-specific values stay outside committed IaC:
    // DATABASE_URL, SESSION_SECRET, WORKSPACE_SIGNING_KEY,
    // STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    // STRIPE_EXPECTED_ACCOUNT_ID, STRIPE_MODE, RESEND_API_KEY
  },
  // Never recreate database storage from this partial alone.
  volumes: preserve(),
});

export default defineRailway(() => {
  return project({
    partial: "onefin-web",
    environments: {
      production: {
        // Keep public traffic on the apex domain only (no payment subdomains).
      },
    },
    resources: [onefinWeb],
  });
});
