import { sitePath, siteUrl } from './site-url';

export type EmailTemplateId =
  | 'welcome'
  | 'login_reminder'
  | 'login_alert'
  | 'forgot_password'
  | 'password_reset'
  | 'activity_key'
  | 'account_updated'
  | 'subscription_plan_reminder'
  | 'subscription_activated'
  | 'subscription_renewed'
  | 'subscription_canceled'
  | 'subscription_expired'
  | 'trial_reminder'
  | 'payment_succeeded'
  | 'payment_failed'
  | 'payment_refunded'
  | 'credit_purchase'
  | 'software_purchase'
  | 'software_payment_failed';

export type EmailTemplateInput = {
  toName?: string | null;
  email?: string;
  actionUrl?: string;
  code?: string;
  planName?: string;
  trialEnd?: string | null;
  periodEnd?: string | null;
  amountLabel?: string | null;
  note?: string | null;
  /** Free-form product / pack / item label. */
  itemName?: string | null;
  /** IP / device / location for security alerts. */
  deviceSummary?: string | null;
  /** Optional second amount (e.g. remaining balance). */
  remainingLabel?: string | null;
  /** Status label shown in details (paid, pending, failed). */
  statusLabel?: string | null;
};

type BuiltTemplate = {
  id: EmailTemplateId;
  subject: string;
  preheader: string;
  heading: string;
  body: string[];
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
  /** Optional code / key callout (activity_key). */
  highlightCode?: string;
  /** Optional meta rows under the body (plan / trial details). */
  details?: Array<{ label: string; value: string }>;
  /** Visual theme for hero imagery + accent. */
  theme: EmailTheme;
};

type EmailTheme = {
  kicker: string;
  heroImage: string;
  accent: string;
  accentSoft: string;
  badge: string;
};

const brand = {
  product: 'One Fin Solution',
  tagline: 'AI chat and software workspace',
  get support() { return sitePath('/support'); },
  get privacy() { return sitePath('/privacy'); },
  get billing() { return sitePath('/dashboard/billing'); },
  get pricing() { return sitePath('/pricing'); },
  get signIn() { return sitePath('/sign-in'); },
  get workspace() { return sitePath('/workspace'); },
  get home() { return siteUrl(); },
};

/** Public assets under /public - always absolute for email clients. Resolved lazily (never at import time). */
function asset(path: string): string {
  return sitePath(path);
}

function assets() {
  return {
    logo: asset('/logo/one-fin-logo.png'),
    heroWelcome: asset('/images/iages4.jpg'),
    heroAuth: asset('/images/iages5.jpg'),
    heroSecurity: asset('/images/iages2.jpg'),
    heroActivity: asset('/images/images1.jpg'),
    heroBilling: asset('/images/iages7.jpg'),
    heroTrial: asset('/images/iages9.jpg'),
    heroSoft: asset('/images/iages3.jpg'),
  } as const;
}

function themes(): Record<string, EmailTheme> {
  const a = assets();
  return {
    welcome: {
      kicker: 'Welcome',
      heroImage: a.heroWelcome,
      accent: '#0f766e',
      accentSoft: '#ecfdf5',
      badge: 'New account',
    },
    auth: {
      kicker: 'Secure access',
      heroImage: a.heroAuth,
      accent: '#0f766e',
      accentSoft: '#f0fdfa',
      badge: 'Sign-in',
    },
    security: {
      kicker: 'Security',
      heroImage: a.heroSecurity,
      accent: '#0e7490',
      accentSoft: '#ecfeff',
      badge: 'Password',
    },
    activity: {
      kicker: 'Verification',
      heroImage: a.heroActivity,
      accent: '#0f766e',
      accentSoft: '#f0fdf4',
      badge: 'Activity key',
    },
    billing: {
      kicker: 'Billing',
      heroImage: a.heroBilling,
      accent: '#0f766e',
      accentSoft: '#f8fafc',
      badge: 'Subscription',
    },
    trial: {
      kicker: 'Trial',
      heroImage: a.heroTrial,
      accent: '#115e59',
      accentSoft: '#f0fdfa',
      badge: 'Reminder',
    },
    purchase: {
      kicker: 'Purchase',
      heroImage: a.heroBilling,
      accent: '#0f766e',
      accentSoft: '#ecfdf5',
      badge: 'Receipt',
    },
    alert: {
      kicker: 'Security alert',
      heroImage: a.heroSecurity,
      accent: '#b45309',
      accentSoft: '#fffbeb',
      badge: 'Login',
    },
    failed: {
      kicker: 'Payment issue',
      heroImage: a.heroBilling,
      accent: '#b91c1c',
      accentSoft: '#fef2f2',
      badge: 'Action needed',
    },
  };
}

function displayName(input: EmailTemplateInput): string {
  const name = (input.toName || '').trim();
  return name || 'there';
}

function absolute(pathOrUrl?: string): string | undefined {
  if (!pathOrUrl) return undefined;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return asset(pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`);
}

export function buildEmailTemplate(id: EmailTemplateId, input: EmailTemplateInput = {}): BuiltTemplate {
  const name = displayName(input);
  const actionUrl = absolute(input.actionUrl);

  switch (id) {
    case 'welcome':
      return {
        id,
        theme: themes().welcome,
        subject: `Welcome to ${brand.product}`,
        preheader: 'Your account is ready. Confirm your email to unlock full access.',
        heading: `Welcome, ${name}`,
        body: [
          `Thanks for creating your ${brand.product} account${input.email ? ` (${input.email})` : ''}.`,
          'Confirm your email to secure the account, then explore homepage chat plans and Workspace credits whenever you are ready.',
          'If you did not create this account, you can ignore this message.',
        ],
        ctaLabel: actionUrl ? 'Confirm email' : 'Open One Fin',
        ctaUrl: actionUrl || brand.signIn,
        footerNote: 'This confirmation link expires for your security.',
      };

    case 'login_reminder':
      return {
        id,
        theme: themes().auth,
        subject: `Your ${brand.product} sign-in link`,
        preheader: 'Use this secure link to access your account.',
        heading: 'Sign in to your account',
        body: [
          `Hi ${name},`,
          'We received a request for a sign-in link. Use the button below to continue. The link expires soon and can only be used once.',
          'If you did not request this, you can safely ignore this email. Your password has not changed.',
        ],
        ctaLabel: 'Sign in securely',
        ctaUrl: actionUrl || brand.signIn,
        footerNote: 'For your protection, never share this link with anyone.',
      };

    case 'forgot_password':
      return {
        id,
        theme: themes().security,
        subject: `Reset your ${brand.product} password`,
        preheader: 'Choose a new password with this secure link.',
        heading: 'Reset your password',
        body: [
          `Hi ${name},`,
          'We received a request to reset the password for your account. Click below to choose a new one.',
          'If you did not ask for a reset, you can ignore this email - your current password stays the same.',
        ],
        ctaLabel: 'Choose a new password',
        ctaUrl: actionUrl || brand.signIn,
        footerNote: 'This reset link expires soon and can only be used once.',
      };

    case 'password_reset':
      return {
        id,
        theme: themes().security,
        subject: `Your ${brand.product} password was updated`,
        preheader: 'A password change was completed on your account.',
        heading: 'Password updated',
        body: [
          `Hi ${name},`,
          'Your password was changed successfully. You can sign in with your new password anytime.',
          'If you did not make this change, reset your password immediately and contact support.',
        ],
        ctaLabel: 'Sign in',
        ctaUrl: actionUrl || brand.signIn,
        footerNote: 'This is a security notification from One Fin Solution.',
      };

    case 'activity_key':
      return {
        id,
        theme: themes().activity,
        subject: `Your ${brand.product} activity key`,
        preheader: 'Use this one-time key to continue.',
        heading: 'Your activity key',
        body: [
          `Hi ${name},`,
          'Use the one-time key below to continue a secure action in One Fin Solution.',
          'Do not share this key. It expires shortly and can only be used once.',
        ],
        highlightCode: (input.code || '').trim() || undefined,
        ctaLabel: actionUrl ? 'Continue in One Fin' : undefined,
        ctaUrl: actionUrl,
        footerNote: 'If you did not request this key, you can ignore this email.',
      };

    case 'subscription_plan_reminder':
      return {
        id,
        theme: themes().billing,
        subject: `Your ${input.planName || 'plan'} is coming up for renewal`,
        preheader: 'A quick look at your upcoming subscription billing.',
        heading: 'Subscription reminder',
        body: [
          `Hi ${name},`,
          `This is a friendly reminder about your ${input.planName || 'homepage chat'} subscription on ${brand.product}.`,
          input.note || 'You can review plan details, payment methods, and renewals anytime from Plans & billing.',
        ],
        details: [
          input.planName ? { label: 'Plan', value: input.planName } : null,
          input.amountLabel ? { label: 'Amount', value: input.amountLabel } : null,
          input.periodEnd ? { label: 'Next billing', value: input.periodEnd } : null,
        ].filter(Boolean) as Array<{ label: string; value: string }>,
        ctaLabel: 'Manage billing',
        ctaUrl: actionUrl || brand.billing,
        footerNote: 'Homepage chat plans are separate from Workspace credits.',
      };

    case 'trial_reminder':
      return {
        id,
        theme: themes().trial,
        subject: `Your ${input.planName || 'trial'} ends soon`,
        preheader: 'Your trial period is ending - keep access without interruption.',
        heading: 'Trial ending soon',
        body: [
          `Hi ${name},`,
          `Your ${input.planName || 'One Fin'} trial is ending soon. Stay on a plan to keep unlimited homepage chat without interruption.`,
          input.note || 'Choose Monthly or Yearly from pricing, or manage billing from your dashboard.',
        ],
        details: [
          input.planName ? { label: 'Plan', value: input.planName } : null,
          input.amountLabel ? { label: 'After trial', value: input.amountLabel } : null,
          input.trialEnd ? { label: 'Trial ends', value: input.trialEnd } : null,
        ].filter(Boolean) as Array<{ label: string; value: string }>,
        ctaLabel: 'View plans',
        ctaUrl: actionUrl || brand.pricing,
        footerNote: 'You will not be charged until the trial ends, based on your selected plan.',
      };


    case 'login_alert':
      return {
        id,
        subject: 'New sign-in to your One Fin account',
        preheader: 'A successful login was just recorded on your account.',
        heading: 'New sign-in detected',
        body: [
          `Hi ${name},`,
          'Someone just signed in to your One Fin account. If this was you, no action is needed.',
          'If you do not recognize this activity, reset your password immediately and contact support.',
        ],
        details: [
          input.deviceSummary ? { label: 'Details', value: input.deviceSummary } : null,
          input.email ? { label: 'Account', value: input.email } : null,
        ].filter(Boolean) as Array<{ label: string; value: string }>,
        ctaLabel: 'Review account security',
        ctaUrl: absolute(input.actionUrl || '/account'),
        footerNote: 'Security notifications help keep your workspace safe.',
        theme: themes().alert,
      };
    case 'account_updated':
      return {
        id,
        subject: 'Your One Fin account was updated',
        preheader: 'Important account details changed.',
        heading: 'Account update confirmation',
        body: [
          `Hi ${name},`,
          input.note || 'Your account settings were updated successfully.',
          'If you did not make this change, reset your password and contact support right away.',
        ],
        ctaLabel: 'Open account',
        ctaUrl: absolute(input.actionUrl || '/account'),
        theme: themes().security,
      };
    case 'subscription_activated':
      return {
        id,
        subject: input.planName ? `Subscription active - ${input.planName}` : 'Your subscription is active',
        preheader: 'Your plan is ready to use.',
        heading: 'Subscription activated',
        body: [
          `Hi ${name},`,
          input.planName
            ? `Your ${input.planName} subscription is now active.`
            : 'Your subscription is now active.',
          'You can manage renewals, invoices, and payment methods from Billing anytime.',
        ],
        details: [
          input.planName ? { label: 'Plan', value: input.planName } : null,
          input.amountLabel ? { label: 'Billing', value: input.amountLabel } : null,
          input.periodEnd ? { label: 'Current period ends', value: input.periodEnd } : null,
        ].filter(Boolean) as Array<{ label: string; value: string }>,
        ctaLabel: 'Open billing',
        ctaUrl: absolute(input.actionUrl || brand.billing),
        theme: themes().billing,
      };
    case 'subscription_renewed':
      return {
        id,
        subject: input.planName ? `Subscription renewed - ${input.planName}` : 'Subscription renewed',
        preheader: 'Your renewal payment was successful.',
        heading: 'Subscription renewed',
        body: [
          `Hi ${name},`,
          'Your subscription renewed successfully. Thank you for staying with One Fin.',
        ],
        details: [
          input.planName ? { label: 'Plan', value: input.planName } : null,
          input.amountLabel ? { label: 'Amount', value: input.amountLabel } : null,
          input.periodEnd ? { label: 'Next renewal', value: input.periodEnd } : null,
        ].filter(Boolean) as Array<{ label: string; value: string }>,
        ctaLabel: 'View invoices',
        ctaUrl: absolute(input.actionUrl || brand.billing),
        theme: themes().billing,
      };
    case 'subscription_canceled':
      return {
        id,
        subject: 'Subscription canceled',
        preheader: 'Your plan cancellation is confirmed.',
        heading: 'Subscription canceled',
        body: [
          `Hi ${name},`,
          input.note ||
            'Your subscription has been canceled. You will keep access through the end of the paid period when applicable.',
          'You can resubscribe from Pricing whenever you are ready.',
        ],
        details: [
          input.planName ? { label: 'Plan', value: input.planName } : null,
          input.periodEnd ? { label: 'Access through', value: input.periodEnd } : null,
        ].filter(Boolean) as Array<{ label: string; value: string }>,
        ctaLabel: 'View plans',
        ctaUrl: absolute(input.actionUrl || brand.pricing),
        theme: themes().billing,
      };
    case 'subscription_expired':
      return {
        id,
        subject: 'Subscription ended',
        preheader: 'Your plan is no longer active.',
        heading: 'Subscription expired',
        body: [
          `Hi ${name},`,
          input.note || 'Your subscription is no longer active. Reactivate anytime to restore full access.',
        ],
        details: [
          input.planName ? { label: 'Plan', value: input.planName } : null,
        ].filter(Boolean) as Array<{ label: string; value: string }>,
        ctaLabel: 'Reactivate',
        ctaUrl: absolute(input.actionUrl || brand.pricing),
        theme: themes().billing,
      };
    case 'payment_succeeded':
      return {
        id,
        subject: input.amountLabel ? `Payment received - ${input.amountLabel}` : 'Payment received',
        preheader: 'We successfully processed your payment.',
        heading: 'Payment confirmation',
        body: [
          `Hi ${name},`,
          input.note || 'Your payment was processed successfully. A receipt is available in your billing history.',
        ],
        details: [
          input.itemName ? { label: 'Item', value: input.itemName } : null,
          input.planName ? { label: 'Plan', value: input.planName } : null,
          input.amountLabel ? { label: 'Amount', value: input.amountLabel } : null,
          input.statusLabel ? { label: 'Status', value: input.statusLabel } : null,
        ].filter(Boolean) as Array<{ label: string; value: string }>,
        ctaLabel: 'Open billing',
        ctaUrl: absolute(input.actionUrl || brand.billing),
        theme: themes().purchase,
      };
    case 'payment_failed':
      return {
        id,
        subject: 'Payment failed - action needed',
        preheader: 'We could not complete your recent payment.',
        heading: 'Payment unsuccessful',
        body: [
          `Hi ${name},`,
          input.note ||
            'We could not complete your recent payment. Update your payment method to avoid interruption.',
        ],
        details: [
          input.itemName ? { label: 'Item', value: input.itemName } : null,
          input.planName ? { label: 'Plan', value: input.planName } : null,
          input.amountLabel ? { label: 'Amount', value: input.amountLabel } : null,
        ].filter(Boolean) as Array<{ label: string; value: string }>,
        ctaLabel: 'Update payment method',
        ctaUrl: absolute(input.actionUrl || brand.billing),
        footerNote: 'No further charges will be attempted until a valid payment method is available.',
        theme: themes().failed,
      };
    case 'payment_refunded':
      return {
        id,
        subject: input.amountLabel ? `Refund processed - ${input.amountLabel}` : 'Refund processed',
        preheader: 'A refund was issued to your original payment method.',
        heading: 'Refund confirmation',
        body: [
          `Hi ${name},`,
          input.note ||
            'A refund was processed for your account. Depending on your bank, it may take several business days to appear.',
        ],
        details: [
          input.itemName ? { label: 'Item', value: input.itemName } : null,
          input.amountLabel ? { label: 'Refund', value: input.amountLabel } : null,
        ].filter(Boolean) as Array<{ label: string; value: string }>,
        ctaLabel: 'View billing',
        ctaUrl: absolute(input.actionUrl || brand.billing),
        theme: themes().purchase,
      };
    case 'credit_purchase':
      return {
        id,
        subject: input.amountLabel ? `Credits purchased - ${input.amountLabel}` : 'Workspace credits added',
        preheader: 'Your workspace credit balance was updated.',
        heading: 'Credits added',
        body: [
          `Hi ${name},`,
          input.note || 'Your workspace credit purchase completed successfully. Credits are available immediately.',
        ],
        details: [
          input.itemName ? { label: 'Pack', value: input.itemName } : null,
          input.amountLabel ? { label: 'Amount', value: input.amountLabel } : null,
          input.statusLabel ? { label: 'Balance', value: input.statusLabel } : null,
        ].filter(Boolean) as Array<{ label: string; value: string }>,
        ctaLabel: 'Open workspace',
        ctaUrl: absolute(input.actionUrl || brand.workspace),
        theme: themes().purchase,
      };
    case 'software_purchase':
      return {
        id,
        subject: input.itemName ? `Software purchase - ${input.itemName}` : 'Software purchase - confirmation',
        preheader: 'We received your software storefront payment.',
        heading: 'Software purchase - update',
        body: [
          `Hi ${name},`,
          input.note || 'Thank you - your software storefront payment was recorded.',
        ],
        details: [
          input.itemName ? { label: 'Product', value: input.itemName } : null,
          input.amountLabel ? { label: 'Paid now', value: input.amountLabel } : null,
          input.remainingLabel ? { label: 'Remaining balance', value: input.remainingLabel } : null,
          input.statusLabel ? { label: 'Status', value: input.statusLabel } : null,
        ].filter(Boolean) as Array<{ label: string; value: string }>,
        ctaLabel: 'View software account',
        ctaUrl: absolute(input.actionUrl || '/software/account'),
        theme: themes().purchase,
      };
    case 'software_payment_failed':
      return {
        id,
        subject: 'Software payment failed',
        preheader: 'We could not complete your software storefront payment.',
        heading: 'Software payment unsuccessful',
        body: [
          `Hi ${name},`,
          input.note ||
            'Your software storefront payment could not be completed. You can try again from checkout or your software account.',
        ],
        details: [
          input.itemName ? { label: 'Product', value: input.itemName } : null,
          input.amountLabel ? { label: 'Attempted amount', value: input.amountLabel } : null,
        ].filter(Boolean) as Array<{ label: string; value: string }>,
        ctaLabel: 'Open software account',
        ctaUrl: absolute(input.actionUrl || '/software/account'),
        theme: themes().failed,
      };

    default: {
      const _exhaustive: never = id;
      throw new Error(`Unknown email template: ${_exhaustive}`);
    }
  }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Branded HTML shell aligned with the One Fin website:
 * teal accents, Inter/Segoe stack, rounded cards, logo header, hero imagery.
 */
export function renderEmailHtml(template: BuiltTemplate): string {
  const theme = template.theme;
  const accent = theme.accent;
  const accentSoft = theme.accentSoft;
  const hero = theme.heroImage;
  const logo = assets().logo;

  const paragraphs = template.body
    .map(
      (line) =>
        `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#334155;">${escapeHtml(line)}</p>`,
    )
    .join('');

  const details =
    template.details && template.details.length
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;border-collapse:separate;border-spacing:0;background:${accentSoft};border:1px solid rgba(15,118,110,0.12);border-radius:14px;overflow:hidden;">
          ${template.details
            .map(
              (row, index) => `
            <tr>
              <td style="padding:12px 16px;font-size:13px;color:#64748b;border-top:${index === 0 ? '0' : '1px solid rgba(15,23,42,0.06)'};width:38%;">${escapeHtml(row.label)}</td>
              <td style="padding:12px 16px;font-size:14px;font-weight:600;color:#0f172a;text-align:right;border-top:${index === 0 ? '0' : '1px solid rgba(15,23,42,0.06)'};">${escapeHtml(row.value)}</td>
            </tr>`,
            )
            .join('')}
        </table>`
      : '';

  const codeBlock = template.highlightCode
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;">
        <tr>
          <td align="center" style="background:linear-gradient(180deg,#f8fafc 0%,${accentSoft} 100%);border:1px dashed rgba(15,118,110,0.35);border-radius:16px;padding:22px 16px;">
            <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:${accent};font-weight:700;">One-time key</p>
            <p style="margin:0;font-size:32px;letter-spacing:0.28em;font-weight:700;color:#0f172a;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">${escapeHtml(template.highlightCode)}</p>
          </td>
        </tr>
      </table>`
    : '';

  const cta =
    template.ctaUrl && template.ctaLabel
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;">
          <tr>
            <td align="center" bgcolor="${accent}" style="border-radius:999px;background:${accent};">
              <a href="${escapeHtml(template.ctaUrl)}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;letter-spacing:0.01em;">
                ${escapeHtml(template.ctaLabel)}
              </a>
            </td>
          </tr>
        </table>
        <p style="margin:0 0 20px;font-size:12px;line-height:1.5;color:#94a3b8;word-break:break-all;">
          Or open this link:<br />
          <a href="${escapeHtml(template.ctaUrl)}" style="color:${accent};text-decoration:underline;">${escapeHtml(template.ctaUrl)}</a>
        </p>`
      : '';

  const footerNote = template.footerNote
    ? `<p style="margin:0 0 18px;font-size:13px;line-height:1.55;color:#64748b;">${escapeHtml(template.footerNote)}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${escapeHtml(template.subject)}</title>
    <!--[if mso]>
    <style type="text/css">
      body, table, td, a { font-family: Arial, Helvetica, sans-serif !important; }
    </style>
    <![endif]-->
  </head>
  <body style="margin:0;padding:0;background:#e8eef5;color:#0f172a;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      ${escapeHtml(template.preheader)}
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e8eef5;margin:0;padding:0;width:100%;">
      <tr>
        <td align="center" style="padding:28px 14px 36px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;border-collapse:separate;">

            <!-- Brand header -->
            <tr>
              <td style="padding:0 4px 14px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="left" style="vertical-align:middle;">
                      <a href="${escapeHtml(brand.home)}" style="text-decoration:none;color:#0f172a;">
                        <img src="${escapeHtml(logo)}" width="40" height="40" alt="${escapeHtml(brand.product)}" style="display:inline-block;border:0;border-radius:10px;vertical-align:middle;outline:none;" />
                        <span style="display:inline-block;vertical-align:middle;margin-left:10px;font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;letter-spacing:-0.01em;color:#0f172a;">
                          ${escapeHtml(brand.product)}
                        </span>
                      </a>
                    </td>
                    <td align="right" style="vertical-align:middle;">
                      <span style="display:inline-block;padding:6px 12px;border-radius:999px;background:#ffffff;border:1px solid rgba(15,118,110,0.18);font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${accent};">
                        ${escapeHtml(theme.badge)}
                      </span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Card -->
            <tr>
              <td style="background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 18px 50px rgba(15,23,42,0.12);border:1px solid rgba(15,23,42,0.06);">

                <!-- Hero -->
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td background="${escapeHtml(hero)}" bgcolor="#0f766e" style="background-image:url('${escapeHtml(hero)}');background-size:cover;background-position:center;background-color:#0f766e;">
                      <!--[if gte mso 9]>
                      <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:600px;height:168px;">
                        <v:fill type="frame" src="${escapeHtml(hero)}" color="#0f766e" />
                        <v:textbox inset="0,0,0,0">
                      <![endif]-->
                      <div style="background:linear-gradient(180deg,rgba(15,23,42,0.28) 0%,rgba(15,118,110,0.78) 100%);padding:28px 28px 26px;">
                        <p style="margin:0 0 8px;font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;font-weight:700;color:#ccfbf1;">
                          ${escapeHtml(theme.kicker)}
                        </p>
                        <h1 style="margin:0;font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:28px;line-height:1.25;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">
                          ${escapeHtml(template.heading)}
                        </h1>
                        <p style="margin:10px 0 0;font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:rgba(255,255,255,0.88);">
                          ${escapeHtml(brand.tagline)}
                        </p>
                      </div>
                      <!--[if gte mso 9]>
                        </v:textbox>
                      </v:rect>
                      <![endif]-->
                    </td>
                  </tr>
                </table>

                <!-- Body -->
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:28px 28px 8px;font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
                      ${paragraphs}
                      ${details}
                      ${codeBlock}
                      ${cta}
                      ${footerNote}
                    </td>
                  </tr>
                </table>

                <!-- Soft footer strip inside card -->
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:0 28px 26px;font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
                      <div style="border-top:1px solid #e2e8f0;padding-top:18px;">
                        <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#475569;">
                          Need help? Our team is here for you.
                        </p>
                        <p style="margin:0;font-size:13px;">
                          <a href="${escapeHtml(brand.support)}" style="color:${accent};font-weight:600;text-decoration:none;">Support</a>
                          <span style="color:#cbd5e1;">&nbsp; - &nbsp;</span>
                          <a href="${escapeHtml(brand.billing)}" style="color:${accent};font-weight:600;text-decoration:none;">Billing</a>
                          <span style="color:#cbd5e1;">&nbsp; - &nbsp;</span>
                          <a href="${escapeHtml(brand.workspace)}" style="color:${accent};font-weight:600;text-decoration:none;">Workspace</a>
                          <span style="color:#cbd5e1;">&nbsp; - &nbsp;</span>
                          <a href="${escapeHtml(brand.privacy)}" style="color:${accent};font-weight:600;text-decoration:none;">Privacy</a>
                        </p>
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Outer footer -->
            <tr>
              <td style="padding:18px 8px 0;text-align:center;font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
                <p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:#64748b;">
                  © ${new Date().getFullYear()} ${escapeHtml(brand.product)}. All rights reserved.
                </p>
                <p style="margin:0;font-size:12px;line-height:1.5;color:#94a3b8;">
                  AI-powered conversations and practical software tools.
                  <br />
                  <a href="${escapeHtml(brand.home)}" style="color:${accent};text-decoration:none;">${escapeHtml(new URL(brand.home).hostname)}</a>
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function renderEmailText(template: BuiltTemplate): string {
  const detailLines =
    template.details?.map((row) => `${row.label}: ${row.value}`) || [];
  const lines = [
    `${brand.product}`,
    template.heading,
    '',
    ...template.body,
    '',
    ...detailLines,
    template.highlightCode ? `Activity key: ${template.highlightCode}` : '',
    '',
    template.ctaUrl ? `${template.ctaLabel || 'Continue'}: ${template.ctaUrl}` : '',
    template.footerNote || '',
    '',
    `Support: ${brand.support}`,
    `Billing: ${brand.billing}`,
    `Privacy: ${brand.privacy}`,
    brand.home,
  ].filter((line, index, arr) => !(line === '' && arr[index - 1] === ''));
  return lines.join('\n');
}

export const EMAIL_TEMPLATE_IDS: EmailTemplateId[] = [
  'welcome',
  'login_reminder',
  'login_alert',
  'forgot_password',
  'password_reset',
  'activity_key',
  'account_updated',
  'subscription_plan_reminder',
  'subscription_activated',
  'subscription_renewed',
  'subscription_canceled',
  'subscription_expired',
  'trial_reminder',
  'payment_succeeded',
  'payment_failed',
  'payment_refunded',
  'credit_purchase',
  'software_purchase',
  'software_payment_failed',
];
