import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowUpRight, KeyRound, ShieldCheck, Users } from 'lucide-react';
import type Stripe from 'stripe';
import { AccountPasswordForm } from '@/components/account-password-form';
import { currentUser } from '@/lib/session';
import { query } from '@/lib/db';
import { readProfile } from '@/lib/account-service';
import { workspaceCreditCost } from '@/lib/credit-config';
import { verifiedStripe } from '@/lib/stripe';
import { stripeObjectMatchesMode } from '@/lib/billing-environment';
import styles from './account-hub.module.css';

export const dynamic = 'force-dynamic';

type CardSummary = {
  count: number | null;
  defaultCard: string | null;
};

type SubscriptionRecord = {
  status: string;
  period_end: string | null;
  next_plan_key: string | null;
  next_plan_at: string | null;
  cancel_at_period_end: boolean;
};

type AccountSession = { created_at: string; expires_at: string };
type ActivityItem = { kind: string; description: string; created_at: string };

const customerTables = {
  homepage: { table: 'billing_customers', scope: 'subscription', app: 'chatbot-template' },
  workspace: { table: 'workspace_billing_customers', scope: 'workspace', app: 'chatbot-template' },
  software: { table: 'software_billing_customers', scope: 'software', app: 'onefin-software-store' },
} as const;

async function paymentCardSummaries(userId: string): Promise<Record<keyof typeof customerTables, CardSummary>> {
  const summaries: Record<keyof typeof customerTables, CardSummary> = {
    homepage: { count: 0, defaultCard: null },
    workspace: { count: 0, defaultCard: null },
    software: { count: 0, defaultCard: null },
  };
  const entries = await Promise.all(
    Object.entries(customerTables).map(async ([product, config]) => {
      const [mapping] = await query<{ customer_id: string }>(
        `select customer_id from ${config.table} where user_id=$1`,
        [userId],
      );
      return [product as keyof typeof customerTables, config, mapping?.customer_id ?? null] as const;
    }),
  );
  const connected = entries.filter(([, , customerId]) => customerId);
  if (!connected.length) return summaries;

  let stripe: Stripe;
  try {
    stripe = await verifiedStripe();
  } catch (error) {
    console.error('Unable to load payment card summaries for account page:', error);
    return { homepage: { count: null, defaultCard: null }, workspace: { count: null, defaultCard: null }, software: { count: null, defaultCard: null } };
  }

  await Promise.all(connected.map(async ([product, config, customerId]) => {
    try {
      const customer = await stripe.customers.retrieve(customerId!);
      if (customer.deleted || !stripeObjectMatchesMode(customer.livemode) ||
          customer.metadata.user_id !== userId ||
          customer.metadata.billing_scope !== config.scope ||
          customer.metadata.app !== config.app) {
        throw new Error(`Unexpected ${product} billing customer.`);
      }
      const defaultValue = customer.invoice_settings?.default_payment_method;
      const defaultId = typeof defaultValue === 'string' ? defaultValue : defaultValue?.id;
      let count = 0;
      let defaultCard: string | null = null;
      for await (const method of stripe.paymentMethods.list({ customer: customerId!, type: 'card', limit: 100 })) {
        count += 1;
        if (method.id === defaultId) {
          defaultCard = `${method.card?.brand || 'Card'} •••• ${method.card?.last4 || '----'}`;
        }
      }
      summaries[product] = { count, defaultCard };
    } catch (error) {
      console.error(`Unable to load ${product} payment card summary:`, error);
      summaries[product] = { count: null, defaultCard: null };
    }
  }));
  return summaries;
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not available';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Not available'
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function cardCount(summary: CardSummary) {
  return summary.count === null ? 'Temporarily unavailable' : `${summary.count} saved`;
}

export default async function MainAccountPage() {
  const user = await currentUser();
  if (!user) redirect('/sign-in?next=%2Faccount');

  const [profile, subscriptionsResult, workspaceResult, softwareResult, sessionsResult, activityResult, cards] =
    await Promise.all([
      readProfile(user.id),
      query<SubscriptionRecord>(
        `select status,period_end::text,next_plan_key,next_plan_at::text,cancel_at_period_end
         from billing_subscriptions where user_id=$1 order by observed_at desc limit 10`,
        [user.id],
      ).catch((error) => {
        console.error('Unable to load homepage billing summary:', error);
        return [];
      }),
      Promise.all([
        query<{ balance: string }>('select available_credits($1)::text as balance', [user.id]),
        query<{ completed: string }>(
          "select count(*)::text as completed from credit_usage where user_id=$1 and status='completed'",
          [user.id],
        ),
        query<{ purchased: string }>(
          'select coalesce(sum(credits),0)::text as purchased from workspace_credit_transactions where user_id=$1',
          [user.id],
        ),
      ]).then(([balance, usage, purchases]) => ({
        balance: balance[0]?.balance || '0',
        completedTasks: usage[0]?.completed || '0',
        purchasedCredits: purchases[0]?.purchased || '0',
      })).catch((error) => {
        console.error('Unable to load Workspace account summary:', error);
        return null;
      }),
      Promise.all([
        query<{ purchases: string; paid_count: string; paid_total: string }>(
          `select count(*)::text as purchases,
             count(*) filter (where status='paid')::text as paid_count,
             coalesce(sum(amount_paid_cents) filter (where status='paid'),0)::text as paid_total
           from software_storefront_purchases where user_id=$1`,
          [user.id],
        ),
        query<{ item_name: string; status: string }>(
          `select item_name,status from software_storefront_purchases
           where user_id=$1 order by created_at desc limit 1`,
          [user.id],
        ),
      ]).then(([totals, latest]) => ({
        purchases: totals[0]?.purchases || '0',
        paidCount: totals[0]?.paid_count || '0',
        paidTotal: totals[0]?.paid_total || '0',
        latestItem: latest[0]?.item_name || null,
        latestStatus: latest[0]?.status || null,
      })).catch((error) => {
        console.error('Unable to load Software account summary:', error);
        return null;
      }),
      query<AccountSession>(
        `select created_at::text,expires_at::text from app_sessions
         where user_id=$1 and expires_at>now() order by created_at desc limit 5`,
        [user.id],
      ).catch((error) => {
        console.error('Unable to load account session history:', error);
        return [];
      }),
      query<ActivityItem>(
        `select kind,description,created_at::text from (
           select 'Homepage'::text as kind,coalesce(name,'Conversation')::text as description,updated_at as created_at
             from chats where user_id=$1
           union all
           select 'Workspace task'::text,status::text as description,created_at
             from credit_usage where user_id=$1
           union all
           select 'Workspace purchase'::text,(credits::text || ' credits purchased')::text as description,created_at
             from workspace_credit_transactions where user_id=$1
           union all
           select 'Software purchase'::text,(item_name || ' · ' || status)::text as description,created_at
             from software_storefront_purchases where user_id=$1
         ) account_activity order by created_at desc limit 8`,
        [user.id],
      ).catch((error) => {
        console.error('Unable to load recent account activity:', error);
        return [];
      }),
      paymentCardSummaries(user.id),
    ]);

  const subscription = subscriptionsResult.find((item) =>
    ['active', 'trialing', 'past_due'].includes(item.status),
  ) || subscriptionsResult[0] || null;
  const latestWorkspacePayment = await query<{ amount: number; currency: string; credits: number; created_at: string }>(
    `select amount,currency,credits,created_at::text from workspace_credit_transactions
     where user_id=$1 order by created_at desc limit 1`,
    [user.id],
  ).then((rows) => rows[0] || null).catch((error) => {
    console.error('Unable to load latest Workspace billing record:', error);
    return null;
  });
  const recentSessions = sessionsResult;
  const lastLogin = recentSessions[0]?.created_at || null;
  const userName = profile?.fullName || profile?.name || user.email;
  const creditCost = workspaceCreditCost();

  return (
    <div className={styles.hub}>
      <nav className={styles.jumpNav} aria-label="Account sections">
        <a href="#security">Security</a>
        <a href="#activity">Activity</a>
        <a href="#billing">Billing</a>
        <a href="#team">Team</a>
        <a href="#homepage">Homepage Settings</a>
        <a href="#software">Software Settings</a>
        <a href="#workspace">Workspace Settings</a>
      </nav>

      <section className={styles.section} id="security">
        <div className={styles.sectionHeading}>
          <div>
            <h2>Security Settings</h2>
            <p className={styles.muted}>Your shared sign-in and account security controls.</p>
          </div>
          <span className={styles.badge}>{profile?.emailVerifiedAt ? 'Email verified' : 'Email verification status unavailable'}</span>
        </div>
        <div className={styles.grid}>
          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <div><h3><KeyRound size={17} aria-hidden="true" /> Change password</h3><p className={styles.muted}>Set a new password for your shared One Fin login.</p></div>
              <span className={styles.badge}>Available</span>
            </div>
            <AccountPasswordForm />
          </article>
          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <div><h3><ShieldCheck size={17} aria-hidden="true" /> Two-factor authentication</h3><p className={styles.muted}>Use an authenticator app to add a second sign-in factor.</p></div>
              <span className={styles.badge}>Not available</span>
            </div>
            <p className={styles.notice}>Authenticator enrollment is not implemented yet. Two-factor authentication is not active on this account.</p>
          </article>
          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <div><h3>Backup code generator</h3><p className={styles.muted}>Recovery codes for accounts protected by 2FA.</p></div>
              <span className={styles.badge}>Not available</span>
            </div>
            <p className={styles.notice}>Backup codes cannot be generated until two-factor authentication is supported and enabled.</p>
            <Link className={styles.link} href="/support">Ask about account security <ArrowUpRight size={15} /></Link>
          </article>
        </div>
      </section>

      <section className={styles.section} id="activity">
        <div className={styles.sectionHeading}>
          <div><h2>Activity</h2><p className={styles.muted}>Recent sign-in sessions and product activity.</p></div>
          <Link className={styles.link} href="/dashboard/activity">Homepage activity <ArrowUpRight size={15} /></Link>
        </div>
        <div className={styles.grid}>
          <article className={styles.card}>
            <h3>Last Login</h3>
            <p className={styles.metric}>{formatDate(lastLogin)}</p>
            <p className={styles.subtle}>Most recent active session sign-in</p>
          </article>
          <article className={styles.card}>
            <h3>Login History</h3>
            <ul className={styles.list}>
              {recentSessions.length ? recentSessions.map((session, index) => (
                <li key={`${session.created_at}-${index}`}>
                  <span>{index === 0 ? 'Most recent session' : 'Active session'}</span>
                  <span>{formatDate(session.created_at)}</span>
                </li>
              )) : <li className={styles.empty}>No active session history is available.</li>}
            </ul>
            <p className={styles.notice}>Only currently active sessions are retained. Past logins are removed when sessions expire or are revoked, so this is not a complete historical login log.</p>
          </article>
          <article className={styles.card}>
            <h3>Recent account activity</h3>
            <ul className={styles.list}>
              {activityResult.length ? activityResult.map((item, index) => (
                <li key={`${item.kind}-${item.created_at}-${index}`}>
                  <span><strong>{item.kind}</strong><small>{item.description}</small></span>
                  <span>{formatDate(item.created_at)}</span>
                </li>
              )) : <li className={styles.empty}>No recent product activity found.</li>}
            </ul>
          </article>
        </div>
      </section>

      <section className={styles.section} id="billing">
        <div className={styles.sectionHeading}>
          <div><h2>Billing</h2><p className={styles.muted}>A consolidated view, with each product’s billing kept separate.</p></div>
        </div>
        <div className={styles.tripleGrid}>
          <article className={styles.card}>
            <h3>Homepage</h3>
            <p>{subscription ? `${subscription.status}${subscription.cancel_at_period_end ? ' · renewal canceled' : ''}` : 'No subscription recorded'}</p>
            <ul className={styles.list}>
              <li><span>Saved cards</span><strong>{cardCount(cards.homepage)}</strong></li>
              <li><span>Default card</span><strong>{cards.homepage.defaultCard || 'None shown'}</strong></li>
              <li><span>Period ends</span><strong>{subscription ? formatDate(subscription.period_end) : '—'}</strong></li>
            </ul>
            <Link className={styles.link} href="/dashboard/billing">Homepage billing <ArrowUpRight size={15} /></Link>
          </article>
          <article className={styles.card}>
            <h3>Workspace</h3>
            <p>{latestWorkspacePayment ? `Last payment: ${(latestWorkspacePayment.amount / 100).toFixed(2)} ${latestWorkspacePayment.currency.toUpperCase()}` : 'No credit purchase recorded'}</p>
            <ul className={styles.list}>
              <li><span>Saved cards</span><strong>{cardCount(cards.workspace)}</strong></li>
              <li><span>Default card</span><strong>{cards.workspace.defaultCard || 'None shown'}</strong></li>
              <li><span>Last credit pack</span><strong>{latestWorkspacePayment ? `${latestWorkspacePayment.credits} credits` : '—'}</strong></li>
            </ul>
            <Link className={styles.link} href="/workspace#workspace-transactions">Workspace billing <ArrowUpRight size={15} /></Link>
          </article>
          <article className={styles.card}>
            <h3>Software</h3>
            <p>{softwareResult ? `${softwareResult.paidCount} paid direct purchase${softwareResult.paidCount === '1' ? '' : 's'}` : 'Purchase summary unavailable'}</p>
            <ul className={styles.list}>
              <li><span>Saved cards</span><strong>{cardCount(cards.software)}</strong></li>
              <li><span>Default card</span><strong>{cards.software.defaultCard || 'None shown'}</strong></li>
              <li><span>Total paid</span><strong>{softwareResult ? `$${(Number(softwareResult.paidTotal) / 100).toFixed(2)} USD` : '—'}</strong></li>
            </ul>
            <Link className={styles.link} href="/software/account">Software billing <ArrowUpRight size={15} /></Link>
          </article>
        </div>
      </section>

      <section className={styles.section} id="team">
        <div className={styles.sectionHeading}>
          <div><h2>Team</h2><p className={styles.muted}>Team membership and collaboration access.</p></div>
        </div>
        <article className={styles.card}>
          <div className={styles.cardHeader}>
            <div><h3><Users size={17} aria-hidden="true" /> Team management</h3><p className={styles.muted}>Signed in as {userName} · {user.email}</p></div>
            <span className={styles.badge}>Not configured</span>
          </div>
          <p className={styles.notice}>Team membership, invitations, and role management are not currently connected to this account.</p>
        </article>
      </section>

      <section className={styles.section} id="homepage">
        <div className={styles.sectionHeading}>
          <div><h2>Homepage Settings</h2><p className={styles.muted}>Read-only summary for Home Page Chat Plus.</p></div>
          <Link className={styles.link} href="/dashboard">Open Homepage dashboard <ArrowUpRight size={15} /></Link>
        </div>
        <article className={styles.card}>
          <div className={styles.statusList}>
            <div className={styles.statusRow}><span>Active subscription</span><strong>{subscription ? subscription.status : 'No active plan'}</strong></div>
            <div className={styles.statusRow}><span>Saved payment cards</span><strong>{cardCount(cards.homepage)}</strong></div>
            <div className={styles.statusRow}><span>Default payment card</span><strong>{cards.homepage.defaultCard || 'No default card'}</strong></div>
            <div className={styles.statusRow}><span>Current period ends</span><strong>{subscription ? formatDate(subscription.period_end) : '—'}</strong></div>
            {subscription?.next_plan_key && <div className={styles.statusRow}><span>Scheduled plan change</span><strong>{subscription.next_plan_key} · {formatDate(subscription.next_plan_at)}</strong></div>}
          </div>
          <Link className={styles.link} href="/dashboard/billing">Manage Homepage billing and cards <ArrowUpRight size={15} /></Link>
        </article>
      </section>

      <section className={styles.section} id="software">
        <div className={styles.sectionHeading}>
          <div><h2>Software Settings</h2><p className={styles.muted}>Read-only summary for direct Software purchases.</p></div>
          <Link className={styles.link} href="/software/account">Open Software dashboard <ArrowUpRight size={15} /></Link>
        </div>
        <article className={styles.card}>
          <div className={styles.statusList}>
            <div className={styles.statusRow}><span>Software purchases</span><strong>{softwareResult?.purchases ?? 'Unavailable'}</strong></div>
            <div className={styles.statusRow}><span>Paid purchases</span><strong>{softwareResult?.paidCount ?? 'Unavailable'}</strong></div>
            <div className={styles.statusRow}><span>Total paid</span><strong>{softwareResult ? `$${(Number(softwareResult.paidTotal) / 100).toFixed(2)} USD` : 'Unavailable'}</strong></div>
            <div className={styles.statusRow}><span>Latest item</span><strong>{softwareResult?.latestItem || 'No purchases yet'}</strong></div>
            <div className={styles.statusRow}><span>Latest status</span><strong>{softwareResult?.latestStatus || '—'}</strong></div>
            <div className={styles.statusRow}><span>Payment cards</span><strong>{cardCount(cards.software)}{cards.software.defaultCard ? ` · ${cards.software.defaultCard}` : ''}</strong></div>
            <div className={styles.statusRow}><span>Recurring Software plans</span><strong>None recorded</strong></div>
          </div>
          <Link className={styles.link} href="/software/account">Manage Software billing and cards <ArrowUpRight size={15} /></Link>
        </article>
      </section>

      <section className={styles.section} id="workspace">
        <div className={styles.sectionHeading}>
          <div><h2>Workspace Settings</h2><p className={styles.muted}>Read-only credit and usage summary for Workspace.</p></div>
          <Link className={styles.link} href="/workspace">Open Workspace dashboard <ArrowUpRight size={15} /></Link>
        </div>
        <article className={styles.card}>
          {workspaceResult ? (
            <div className={styles.statusList}>
              <div className={styles.statusRow}><span>Available credits</span><strong>{workspaceResult.balance}</strong></div>
              <div className={styles.statusRow}><span>Credits purchased</span><strong>{workspaceResult.purchasedCredits}</strong></div>
              <div className={styles.statusRow}><span>Completed tasks</span><strong>{workspaceResult.completedTasks}</strong></div>
              <div className={styles.statusRow}><span>Current cost per completed task</span><strong>{creditCost} credit{creditCost === 1 ? '' : 's'}</strong></div>
              <div className={styles.statusRow}><span>Payment cards</span><strong>{cardCount(cards.workspace)}{cards.workspace.defaultCard ? ` · ${cards.workspace.defaultCard}` : ''}</strong></div>
            </div>
          ) : <p className={styles.notice}>Workspace usage summary is temporarily unavailable.</p>}
          <p className={styles.notice}>Workspace uses purchased credits, not a fixed storage capacity. Automatic and scheduled credit reloads are not currently available.</p>
          <Link className={styles.link} href="/workspace">View Workspace usage, transactions, and payment settings <ArrowUpRight size={15} /></Link>
        </article>
      </section>
    </div>
  );
}
