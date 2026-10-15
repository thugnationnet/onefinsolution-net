import 'server-only';
import { createHash } from 'node:crypto';
import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { company } from './company';
import {
  EMAIL_TEMPLATE_IDS,
  buildEmailTemplate,
  renderEmailHtml,
  renderEmailText,
  type EmailTemplateId,
  type EmailTemplateInput,
} from './email-templates';

function trimEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export function emailConfigured() {
  return Boolean(
    trimEnv('RESEND_API_KEY') ||
      (trimEnv('SMTP_HOST') && trimEnv('SMTP_USER') && trimEnv('SMTP_PASSWORD') && trimEnv('EMAIL_FROM')),
  );
}

export function resolveFromAddress(kind: 'default' | 'auth' | 'billing' | 'noreply' = 'default'): string {
  const mailDomain = new URL(company.website).hostname;
  const defaults = trimEnv('EMAIL_FROM') || trimEnv('RESEND_FROM') || `One Fin Solution <noreply@${mailDomain}>`;
  if (kind === 'auth') return trimEnv('EMAIL_FROM_AUTH') || trimEnv('RESEND_FROM_AUTH') || defaults;
  if (kind === 'billing') return trimEnv('EMAIL_FROM_BILLING') || trimEnv('RESEND_FROM_BILLING') || defaults;
  if (kind === 'noreply') return trimEnv('EMAIL_FROM_NOREPLY') || trimEnv('RESEND_FROM_NOREPLY') || defaults;
  return defaults;
}

function resendClient(): Resend | null {
  const key = trimEnv('RESEND_API_KEY');
  return key ? new Resend(key) : null;
}

function smtpTransport() {
  const host = trimEnv('SMTP_HOST');
  const user = trimEnv('SMTP_USER');
  const pass = trimEnv('SMTP_PASSWORD');
  if (!host || !user || !pass) return null;
  const port = Number(trimEnv('SMTP_PORT') || 587);
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user, pass },
    connectionTimeout: 10000,
    socketTimeout: 15000,
  });
}

async function deliver(options: {
  to: string;
  subject: string;
  html: string;
  text: string;
  from: string;
  reference?: string;
  tags?: Array<{ name: string; value: string }>;
  replyTo?: string;
}) {
  const to = options.to.trim().toLowerCase();
  if (!to.includes('@')) throw new Error('Invalid recipient email.');

  const resend = resendClient();
  if (resend) {
    const result = await resend.emails.send({
      from: options.from,
      to: [to],
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo || trimEnv('EMAIL_REPLY_TO'),
      tags: options.tags,
      headers: options.reference
        ? {
            'X-Entity-Ref-ID': createHash('sha256').update(options.reference).digest('hex'),
          }
        : undefined,
    });
    if (result.error) throw new Error(result.error.message);
    return { provider: 'resend' as const, id: result.data?.id };
  }

  const transport = smtpTransport();
  if (!transport || !trimEnv('EMAIL_FROM')) {
    throw new Error('Email delivery is not configured. Set RESEND_API_KEY or SMTP credentials.');
  }

  const result = await transport.sendMail({
    from: options.from,
    to,
    subject: options.subject,
    html: options.html,
    text: options.text,
    replyTo: options.replyTo || trimEnv('EMAIL_REPLY_TO'),
    messageId: options.reference
      ? `<${createHash('sha256').update(options.reference).digest('hex')}@${new URL(company.website).hostname}>`
      : undefined,
  });
  if (!result.accepted?.length) throw new Error('Email was not accepted.');
  return { provider: 'smtp' as const, id: typeof result.messageId === 'string' ? result.messageId : undefined };
}

export async function sendTemplateEmail(
  templateId: EmailTemplateId,
  to: string,
  input: EmailTemplateInput = {},
  options?: {
    fromKind?: 'default' | 'auth' | 'billing' | 'noreply';
    reference?: string;
    replyTo?: string;
  },
) {
  const template = buildEmailTemplate(templateId, { ...input, email: input.email || to });
  const fromKind =
    options?.fromKind ||
    (templateId === 'subscription_plan_reminder' || templateId === 'trial_reminder'
      ? 'billing'
      : 'auth');

  return deliver({
    to,
    subject: template.subject,
    html: renderEmailHtml(template),
    text: renderEmailText(template),
    from: resolveFromAddress(fromKind),
    reference: options?.reference,
    replyTo: options?.replyTo,
    tags: [
      { name: 'template', value: templateId },
      { name: 'app', value: 'onefin' },
    ],
  });
}

/** Auth magic-link / reset / verify emails (existing API used by auth-service). */
export async function sendAuthEmail(email: string, url: string, purpose: 'verify' | 'reset' | 'login') {
  if (!emailConfigured()) {
    throw new Error('Email delivery is not configured. Please contact the site administrator.');
  }

  const templateId: EmailTemplateId =
    purpose === 'verify' ? 'welcome' : purpose === 'reset' ? 'forgot_password' : 'login_reminder';

  await sendTemplateEmail(templateId, email, { actionUrl: url }, { fromKind: 'auth', reference: `${purpose}:${email}:${url}` });
}

export async function sendPasswordChangedEmail(email: string, actionUrl?: string) {
  if (!emailConfigured()) return;
  await sendTemplateEmail('password_reset', email, { actionUrl }, { fromKind: 'auth' });
}

export async function sendActivityKeyEmail(email: string, code: string, actionUrl?: string) {
  if (!emailConfigured()) {
    throw new Error('Email delivery is not configured. Please contact the site administrator.');
  }
  await sendTemplateEmail('activity_key', email, { code, actionUrl }, { fromKind: 'auth', reference: `activity:${email}:${code}` });
}

export async function sendSubscriptionReminderEmail(
  email: string,
  input: { planName?: string; periodEnd?: string; amountLabel?: string; note?: string; actionUrl?: string },
) {
  if (!emailConfigured()) return;
  await sendTemplateEmail('subscription_plan_reminder', email, input, { fromKind: 'billing' });
}

export async function sendTrialReminderEmail(
  email: string,
  input: { planName?: string; trialEnd?: string; amountLabel?: string; actionUrl?: string },
) {
  if (!emailConfigured()) return;
  await sendTemplateEmail('trial_reminder', email, input, { fromKind: 'billing' });
}

/** Existing billing notice delivery API. */
export async function sendBillingEmail(email: string, subject: string, text: string, reference: string) {
  if (!emailConfigured()) {
    throw new Error('Email delivery is not configured.');
  }

  const lower = `${subject}\n${text}`.toLowerCase();
  const base = {
    note: text,
    actionUrl: '/dashboard/billing' as string | undefined,
  };

  if (lower.includes('trial') && (lower.includes('end') || lower.includes('ending') || lower.includes('will end'))) {
    await sendTemplateEmail('trial_reminder', email, base, { fromKind: 'billing', reference });
    return;
  }
  if (lower.includes('refund')) {
    await sendTemplateEmail('payment_refunded', email, base, { fromKind: 'billing', reference });
    return;
  }
  if (lower.includes('payment failed') || lower.includes('payment unsuccessful') || (lower.includes('failed') && lower.includes('payment'))) {
    await sendTemplateEmail('payment_failed', email, base, { fromKind: 'billing', reference });
    return;
  }
  if (lower.includes('credit') && (lower.includes('purchase') || lower.includes('added') || lower.includes('pack'))) {
    await sendTemplateEmail('credit_purchase', email, { ...base, actionUrl: '/workspace' }, { fromKind: 'billing', reference });
    return;
  }
  if (lower.includes('software') && lower.includes('fail')) {
    await sendTemplateEmail('software_payment_failed', email, { ...base, actionUrl: '/software/account' }, { fromKind: 'billing', reference });
    return;
  }
  if (lower.includes('software')) {
    await sendTemplateEmail('software_purchase', email, { ...base, actionUrl: '/software/account' }, { fromKind: 'billing', reference });
    return;
  }
  if (lower.includes('canceled') || lower.includes('cancelled')) {
    await sendTemplateEmail('subscription_canceled', email, base, { fromKind: 'billing', reference });
    return;
  }
  if (lower.includes('expired') || lower.includes('ended')) {
    await sendTemplateEmail('subscription_expired', email, base, { fromKind: 'billing', reference });
    return;
  }
  if (lower.includes('renew')) {
    await sendTemplateEmail('subscription_renewed', email, base, { fromKind: 'billing', reference });
    return;
  }
  if (lower.includes('active') || lower.includes('activated') || lower.includes('created')) {
    await sendTemplateEmail('subscription_activated', email, base, { fromKind: 'billing', reference });
    return;
  }
  if (lower.includes('payment received') || lower.includes('payment success') || lower.includes('invoice paid')) {
    await sendTemplateEmail('payment_succeeded', email, base, { fromKind: 'billing', reference });
    return;
  }
  if (lower.includes('subscription') || lower.includes('plan')) {
    await sendTemplateEmail('subscription_plan_reminder', email, base, { fromKind: 'billing', reference });
    return;
  }

  const html = `<!doctype html><html><body style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.5;color:#111827;"><p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#0f766e;font-weight:700;">${company.name}</p><h1 style="font-size:22px;">${subject}</h1><pre style="white-space:pre-wrap;font-family:inherit;font-size:15px;">${text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</pre></body></html>`;
  await deliver({
    to: email,
    subject: `${subject} - One Fin`,
    html,
    text: `${company.name}\n\n${text}`,
    from: resolveFromAddress('billing'),
    reference,
    tags: [
      { name: 'template', value: 'billing_notice' },
      { name: 'app', value: 'onefin' },
    ],
  });
}

export function listEmailTemplates() {
  return EMAIL_TEMPLATE_IDS.map((id) => {
    const sample = buildEmailTemplate(id, {
      toName: 'Alex',
      email: 'alex@example.com',
      actionUrl: '/sign-in',
      code: '123456',
      planName: 'Monthly',
      trialEnd: 'March 20, 2026',
      periodEnd: 'April 1, 2026',
      amountLabel: '$9.00 USD / month',
    });
    return { id, subject: sample.subject };
  });
}

export { EMAIL_TEMPLATE_IDS, buildEmailTemplate, renderEmailHtml, renderEmailText };

export async function sendWelcomeEmail(
  email: string,
  input: { toName?: string | null; actionUrl?: string; note?: string } = {},
) {
  if (!emailConfigured()) return;
  await sendTemplateEmail(
    'welcome',
    email,
    {
      toName: input.toName,
      actionUrl: input.actionUrl || '/workspace',
      note: input.note,
    },
    { fromKind: 'auth', reference: `welcome:${email}` },
  );
}

export async function sendLoginAlertEmail(
  email: string,
  input: { toName?: string | null; deviceSummary?: string | null; actionUrl?: string } = {},
) {
  if (!emailConfigured()) return;
  await sendTemplateEmail(
    'login_alert',
    email,
    {
      toName: input.toName,
      email,
      deviceSummary: input.deviceSummary,
      actionUrl: input.actionUrl || '/account',
    },
    { fromKind: 'auth', reference: `login-alert:${email}:${Date.now()}` },
  );
}

export async function sendAccountUpdatedEmail(
  email: string,
  input: { toName?: string | null; note?: string; actionUrl?: string } = {},
) {
  if (!emailConfigured()) return;
  await sendTemplateEmail(
    'account_updated',
    email,
    {
      toName: input.toName,
      note: input.note,
      actionUrl: input.actionUrl || '/account',
    },
    { fromKind: 'auth', reference: `account-updated:${email}:${Date.now()}` },
  );
}

export async function sendSubscriptionLifecycleEmail(
  email: string,
  kind: 'subscription_activated' | 'subscription_renewed' | 'subscription_canceled' | 'subscription_expired',
  input: {
    toName?: string | null;
    planName?: string;
    amountLabel?: string;
    periodEnd?: string | null;
    note?: string;
    actionUrl?: string;
  } = {},
) {
  if (!emailConfigured()) return;
  await sendTemplateEmail(
    kind,
    email,
    {
      toName: input.toName,
      planName: input.planName,
      amountLabel: input.amountLabel,
      periodEnd: input.periodEnd,
      note: input.note,
      actionUrl: input.actionUrl || '/dashboard/billing',
    },
    { fromKind: 'billing', reference: `${kind}:${email}:${input.planName || ''}` },
  );
}

export async function sendPaymentSucceededEmail(
  email: string,
  input: {
    toName?: string | null;
    itemName?: string;
    planName?: string;
    amountLabel?: string;
    statusLabel?: string;
    note?: string;
    actionUrl?: string;
  } = {},
) {
  if (!emailConfigured()) return;
  await sendTemplateEmail(
    'payment_succeeded',
    email,
    {
      toName: input.toName,
      itemName: input.itemName,
      planName: input.planName,
      amountLabel: input.amountLabel,
      statusLabel: input.statusLabel,
      note: input.note,
      actionUrl: input.actionUrl || '/dashboard/billing',
    },
    { fromKind: 'billing', reference: `payment-succeeded:${email}:${input.amountLabel || ''}` },
  );
}

export async function sendPaymentFailedEmail(
  email: string,
  input: {
    toName?: string | null;
    itemName?: string;
    planName?: string;
    amountLabel?: string;
    note?: string;
    actionUrl?: string;
  } = {},
) {
  if (!emailConfigured()) return;
  await sendTemplateEmail(
    'payment_failed',
    email,
    {
      toName: input.toName,
      itemName: input.itemName,
      planName: input.planName,
      amountLabel: input.amountLabel,
      note: input.note,
      actionUrl: input.actionUrl || '/dashboard/billing',
    },
    { fromKind: 'billing', reference: `payment-failed:${email}:${input.amountLabel || ''}` },
  );
}

export async function sendPaymentRefundedEmail(
  email: string,
  input: {
    toName?: string | null;
    itemName?: string;
    amountLabel?: string;
    note?: string;
    actionUrl?: string;
  } = {},
) {
  if (!emailConfigured()) return;
  await sendTemplateEmail(
    'payment_refunded',
    email,
    {
      toName: input.toName,
      itemName: input.itemName,
      amountLabel: input.amountLabel,
      note: input.note,
      actionUrl: input.actionUrl || '/dashboard/billing',
    },
    { fromKind: 'billing', reference: `payment-refunded:${email}:${input.amountLabel || ''}` },
  );
}

export async function sendCreditPurchaseEmail(
  email: string,
  input: {
    toName?: string | null;
    itemName?: string;
    amountLabel?: string;
    statusLabel?: string;
    note?: string;
    actionUrl?: string;
  } = {},
) {
  if (!emailConfigured()) return;
  await sendTemplateEmail(
    'credit_purchase',
    email,
    {
      toName: input.toName,
      itemName: input.itemName,
      amountLabel: input.amountLabel,
      statusLabel: input.statusLabel,
      note: input.note,
      actionUrl: input.actionUrl || '/workspace',
    },
    { fromKind: 'billing', reference: `credit-purchase:${email}:${input.amountLabel || ''}` },
  );
}

export async function sendSoftwarePurchaseEmail(
  email: string,
  input: {
    toName?: string | null;
    itemName?: string;
    amountLabel?: string;
    remainingLabel?: string;
    statusLabel?: string;
    note?: string;
    actionUrl?: string;
  } = {},
) {
  if (!emailConfigured()) return;
  await sendTemplateEmail(
    'software_purchase',
    email,
    {
      toName: input.toName,
      itemName: input.itemName,
      amountLabel: input.amountLabel,
      remainingLabel: input.remainingLabel,
      statusLabel: input.statusLabel,
      note: input.note,
      actionUrl: input.actionUrl || '/software/account',
    },
    { fromKind: 'billing', reference: `software-purchase:${email}:${input.itemName || ''}` },
  );
}

export async function sendSoftwarePaymentFailedEmail(
  email: string,
  input: {
    toName?: string | null;
    itemName?: string;
    amountLabel?: string;
    note?: string;
    actionUrl?: string;
  } = {},
) {
  if (!emailConfigured()) return;
  await sendTemplateEmail(
    'software_payment_failed',
    email,
    {
      toName: input.toName,
      itemName: input.itemName,
      amountLabel: input.amountLabel,
      note: input.note,
      actionUrl: input.actionUrl || '/software/account',
    },
    { fromKind: 'billing', reference: `software-payment-failed:${email}:${input.itemName || ''}` },
  );
}

export type { EmailTemplateId, EmailTemplateInput };
