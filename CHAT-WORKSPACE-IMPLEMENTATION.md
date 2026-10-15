# Chat and Workspace implementation

## Feature placement

| Experience | Purpose and features |
| --- | --- |
| Homepage and saved Chat routes | Everyday subscription-backed conversations; streaming and cancellation; browser dictation and read-aloud; image and text references; user copy, edit, resend and branching; response regeneration, feedback/reporting, sharing response text, saving useful answers to Context. |
| Workspace | Credit-backed tasks; persistent task sessions and reopening after refresh; text, Markdown, CSV and code references; task history and projects; Workspace balance, purchases, payment methods, transactions and usage. |
| Both | Private saved conversations; search across titles, projects and message content; pin/unpin; archive/restore; rename; deletion confirmation; project assignment/filtering; duplication; Markdown/JSON export; Markdown, tables, highlighted code and code-copy controls; math rendering; responsive navigation and account preferences. |

Advanced history controls live under “Manage chats and projects” in Chat. Workspace places saved tasks and projects beside its task studio rather than mixing them with homepage subscriptions. Project organization uses a simple account-owned project label on each conversation, not collaborative project workspaces.

## Reused infrastructure

Next.js server actions, native PostgreSQL sessions and row-level security, the existing Chat/messages/context schema, OpenAI and xAI routing, subscription access checks, Workspace credit reservations/refunds, separate Stripe Test Mode billing, account preferences, Context library, browser speech recognition/synthesis, image/text attachment handling, toast notifications, and responsive navigation.

Existing local changes in the homepage shell, sidebar, Workspace, styles, composer, and website tests were preserved and extended. Nothing was deployed or written to an external database or payment service during this work.

## Frontend changes

- `components/message-content.tsx`: shared safe Markdown renderer with GFM tables, highlighted code, copy-code buttons and KaTeX math. Raw HTML is not enabled. External images render as explicit links so rendering a private chat does not automatically contact arbitrary image hosts.
- `components/conversation-tools.tsx`: database search, project filtering and organization, duplication, export, rename, archive, pin and confirmed deletion, with loading/error/retry handling.
- `components/chat-interface.tsx`: live streaming preview, cancellation, Markdown rendering, dropped files and pasted images, user edit/resend/copy/branch actions, persistent helpful/not-helpful/report feedback, Markdown/JSON export and jump-to-latest.
- `components/workspace-application.tsx`: persistent sessions, task URL restoration, saved task manager, new-task controls, supported text attachment validation/removal, copy and export, Enter-to-send with Shift+Enter for newlines.
- `components/sidebar.tsx`, `app/client.tsx`: advanced history management and consistent Chat sidebar on saved conversation routes.
- `app/c/[chatId]/page.tsx`: remount conversation state when navigating between chats, cancelling an old request.
- `app/globals.css`: renderer, code, tables, conversation toolbar and manager styling.

## Backend changes

- `app/conversation-actions.ts`: authenticated, ownership-scoped search, organization, duplication/branching, feedback and editing. Editing locks the conversation and atomically removes later turns. Branching copies earlier messages to a new private conversation.
- `app/api/chat/route.ts`: origin/authentication/subscription/model/context validation, input limits, server-side throttling, provider streaming, cancellation, completed usage recording and sanitized errors. Completed replies continue to use the existing message-save actions; partial or interrupted replies are not saved as completed answers.
- `lib/chat-request.ts`, `lib/read-chat-stream.ts`: bounded request validation and chunk-safe UTF-8/NDJSON handling. A missing completion event is an error, not a successful reply.
- `lib/ai.ts`: optional real streaming via the OpenAI Responses API and xAI-compatible Chat Completions API, with completion checking and abort signals. Existing non-streaming paths remain available.
- `app/api/workspace/route.ts`: saves successful user/assistant turns and finalizes credits in the same database transaction; ownership and area checks; serializes commits for a session and rejects conflicting concurrent updates; failed generation refunds reservations.
- `app/actions.ts`: separates homepage history from Workspace sessions, hides archived conversations from recent history, orders pinned chats first and throttles the existing generation action.
- `app/api/account/export/route.ts`: includes organization fields and feedback in private account-data exports.

Streaming follows the provider event handling described in [official OpenAI documentation](https://developers.openai.com/api/docs/guides/streaming-responses).

## Database changes

Apply `migrations/railway/007_conversation_tools.sql` with the existing migration runner. It adds `area`, `pinned`, `archived`, and `project` to chats, an organization index, and an ownership-protected `message_feedback` table. Existing conversations default to the Chat area; no historical rows are deleted by migration. Deleting messages/conversations cascades their feedback.

## Integration and configuration

No new external service is required for these changes. The Markdown renderer adds `react-markdown`, `remark-gfm`, `rehype-highlight`, `remark-math`, and `rehype-katex`. A KaTeX override selects version 0.18.2 or newer to avoid the trust-bypass advisory reported for the default transitive version; a renderer integration test verifies this combination.

The local configuration check found:

- `DATABASE_URL`: absent. Configure native PostgreSQL before running the application against real saved data.
- `AI_PROVIDER`: unset, therefore defaults to `openai`.
- `OPENAI_API_KEY`: absent.
- `XAI_API_KEY`: present. Select `AI_PROVIDER=xai` to use it, or configure an OpenAI key. Key contents were not inspected or printed.
- Stripe secret and publishable keys: absent locally; purchases require the existing verified Test Mode Stripe configuration.

Use `.env.example` and `DEPLOYMENT.md` for the full configuration contract. Actual provider availability, paid usage, voice permissions and Stripe transactions were not verified by live external calls.

## Verification

The added tests execute organization, search, editing, branching and feedback actions against a PostgreSQL-compatible database and test cross-account isolation. Edit/branch operations preserve PostgreSQL timestamp microseconds; a regression test covers a fractional timestamp. Provider fixture tests verify real stream handling code, interrupted responses, split UTF-8 chunks, payload bounds, origin checks, session checks, subscription checks and private context access.

The website test uses an isolated native PostgreSQL instance, the production Next.js application and Playwright. New checks cover rendered tables/code, persisted feedback, message-content search, pinning, archive/restore, Workspace reopening after refresh, valid/invalid attachments, tablet/mobile overflow and wrong-area Workspace API rejection. It never contacts real AI or Stripe services.

The full 34-test suite passed. The timestamp regression test passed after the precision fix. Production build, TypeScript checking and lint passed on the final implementation. Lint retains two existing unused-variable warnings in `utils/supabase/middleware.ts`.

`npm.cmd run test:chat` passed four browser workflows against the production application and an isolated native PostgreSQL database: response rendering/copy/feedback; edit/refresh/branch persistence; search/pin/archive/restore; and Workspace refresh, attachment validation, ownership/area checks and responsive layouts. These workflows contain multiple assertions, including clipboard contents and database records. Tablet/mobile checks include internal task-grid width, not just overall page overflow. Screenshots are saved under `.test-artifacts/website/chat-workspace-desktop.png` and `chat-workspace-mobile.png`.

The full website browser suite repeatedly timed out waiting for the “Profile saved” notice in the existing account profile form, despite the database write succeeding; a later run also timed out on the sign-in redirect. Changing the local hostname did not resolve those flows, so the original test-server address was restored. These are unresolved browser-flow failures; the full website suite is not claimed to pass. `npm.cmd run test:chat` isolates conversation checks using a real database-backed fixture session, while retaining the signup/sign-in/profile browser checks under the full website command. Authentication is still enforced by the application; the focused run does not claim to test the sign-in form.

`npm audit --omit=dev` reports zero vulnerabilities. The full audit reports seven high-severity advisories in existing development glob/ESLint dependencies; these were not force-fixed by downgrading Next.js tooling. Existing billing tests emit duplicate checkout-attempt logging warnings while passing; this work did not change that subsystem.

## Limitations and deferred integrations

- The inventory is broader than this implementation. Web search/deep research, image generation, sandboxed code execution, interactive charts/canvas, custom assistants, collaborative invitations, public shared conversation URLs, persistent memory, and realtime voice-to-voice were not implemented. They need separate service, permission, billing and data lifecycle decisions; no placeholder controls claim to provide them.
- Browser dictation/read-aloud remain browser-dependent. They are not provider realtime audio sessions.
- Chat images use the existing in-session attachment path; image bytes are not durably stored. A refreshed image conversation requires reattaching images before regeneration. Workspace attachments persist extracted text inside the user turn, not original binary files.
- PDF, Word and Excel binary extraction and a secure original-file library are not implemented. Text/CSV/code are supported; unsupported files fail visibly.
- Model selection remains the existing single configured server model. No unsupported model is advertised.
- Workspace responses remain non-streaming. Homepage Chat streams; completed Workspace tasks are saved and charged atomically.
- Search returns the latest 100 matching conversations. Project labels are lightweight organization, not standalone collaborative project records.
- Chat edits truncate later turns after explicit confirmation; they do not keep a version history. Use “Branch here” first when you want to preserve the original.
- Feedback/reporting persists records; it does not create an email or moderation queue notification.
- Chat generation and completed message saving remain separate operations. Existing save failures warn the user to copy the reply. Cancelling an initial generation leaves the saved prompt available for retry.

## Run and deploy

```powershell
npm.cmd ci
# Configure DATABASE_URL and the selected AI provider in .env.local.
npm.cmd run db:migrate
npm.cmd run dev
```

For production, apply migrations before starting the new application version, then run `npm.cmd run build` and `npm.cmd start`, following `DEPLOYMENT.md`. Configure a paid provider account and preserve existing subscription access and Workspace Test Mode billing settings. Do not infer production readiness from provider fixtures alone; verify real provider access and configured billing in the intended environment.

Validation commands:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:chat
npm.cmd run test:website
```
