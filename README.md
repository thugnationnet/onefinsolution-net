# One Fin Solution

AI chat application for ONE FIN SOLUTION COMPANY LIMITED, registration 0115569007686.

Next.js with Railway PostgreSQL, native secure email/password sessions, OpenAI/xAI providers, and Stripe Test billing and credits.

## Chat and Workspace

- **Homepage Chat** is the subscription-gated conversation experience. It supports saved chat history, streaming responses, model selection (the configured server-side model), context references, text/code and image attachments, browser speech input/output, response actions, and conversation organization/export.
- **Workspace** is a separate credit-metered task environment. Users can inspect the interface while signed out, then sign in when they start a task, check credits, purchase a one-time pack, manage a saved payment method, and review usage and purchase history. Text and supported image attachments are sent to the configured AI provider; successful task responses consume Workspace credits only.
- A chat subscription does not grant Workspace credits, and Workspace purchases do not grant Chat access.

Provider and feature boundaries are documented in [deployment and configuration](DEPLOYMENT.md). Unsupported external features are not represented as working controls.

See [deployment and configuration](DEPLOYMENT.md) and [.env.example](.env.example). Run `npm ci`, configure an ignored `.env.local`, then `npm run db:migrate` and `npm run dev`.

Verification: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.

No Supabase project is required. Do not use the Sanbay Stripe account.
