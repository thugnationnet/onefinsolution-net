import Link from 'next/link';
import { currentUser } from '@/lib/session';
import { redirect } from 'next/navigation';
import { dashboardData, accountDate } from '@/lib/dashboard';
import { PageHeading } from '@/components/page-heading';
import { defaultPreferences } from '@/lib/account-preferences';

export default async function Dashboard() {
  const user = await currentUser();
  if (!user) redirect('/sign-in');

  let data: Awaited<ReturnType<typeof dashboardData>>;
  try {
    data = await dashboardData(user.id);
  } catch {
    data = {
      name: '',
      counts: { chats: '0', contexts: '0', responses: '0' },
      balance: '0',
      chats: [],
      subscriptions: [],
      usage: [],
      chatUsage: [],
      openRequests: '0',
      preferences: { ...defaultPreferences },
    };
  }

  const timezone = data.preferences?.timezone || defaultPreferences.timezone;
  const active = data.subscriptions.find((sub) =>
    ['active', 'trialing', 'past_due'].includes(String(sub.status)),
  );

  return (
    <div className="page-wrap">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <PageHeading
          eyebrow="YOUR DASHBOARD"
          title={data.name ? `Welcome back, ${String(data.name).split(' ')[0]}.` : 'Welcome to your account.'}
          description="A clear overview of your homepage chat subscription and separate Workspace credits."
        />
        <Link className="button" href="/">
          Open homepage chat
        </Link>
      </div>

      <section className="three-grid">
        <article className="panel">
          <span className="eyebrow">WORKSPACE CREDITS</span>
          <strong className="metric">{data.balance}</strong>
          <p>Available for credit-based Workspace tasks.</p>
          <Link className="text-link" href="/workspace">
            Manage Workspace credits →
          </Link>
        </article>
        <article className="panel">
          <span className="eyebrow">CONVERSATIONS</span>
          <strong className="metric">{data.counts.chats}</strong>
          <p>{data.counts.responses} completed homepage chat responses.</p>
          <Link className="text-link" href="/dashboard/activity">
            View activity →
          </Link>
        </article>
        <article className="panel">
          <span className="eyebrow">SAVED CONTEXT</span>
          <strong className="metric">{data.counts.contexts}</strong>
          <p>Reference notes for your chat.</p>
          <Link className="text-link" href="/context">
            Manage context →
          </Link>
        </article>
      </section>

      <section className="two-grid section-space">
        <div className="panel">
          <div className="flex items-center justify-between gap-3">
            <h2>Recent conversations</h2>
            <Link className="text-link text-sm" href="/dashboard/activity">
              View all
            </Link>
          </div>
          {data.chats.length ? (
            <ul className="data-list">
              {data.chats.map((chat) => (
                <li key={String(chat.id)}>
                  <Link className="text-link break-words" href={`/c/${chat.id}`}>
                    {String(chat.name || 'Untitled conversation')}
                  </Link>
                  <small>{accountDate(String(chat.updated_at), timezone)}</small>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-state">
              <p>Your first conversation starts with a question.</p>
              <Link className="button secondary mt-5" href="/">
                Start a conversation
              </Link>
            </div>
          )}
        </div>

        <div className="stack">
          <div className="panel">
            <h2>Homepage chat plan</h2>
            <span className="badge">{active ? String(active.status) : 'No active chat plan'}</span>
            <p>
              {active
                ? `${active.cancel_at_period_end ? 'Paid access ends' : 'Current period ends'} ${accountDate(String(active.period_end), timezone)}`
                : 'Subscribe to access the homepage chat.'}
            </p>
            <Link className="text-link" href="/dashboard/billing">
              Manage chat plans & billing →
            </Link>
          </div>
          <div className="panel">
            <h2>Account & support</h2>
            <p>
              {data.openRequests} open support {data.openRequests === '1' ? 'request' : 'requests'}.
            </p>
            <div className="button-row">
              <Link href="/" className="button secondary small">
                Account settings
              </Link>
              <Link href="/account" className="button secondary small">
                Workspace setup
              </Link>
              <Link href="/dashboard/support" className="text-link">
                My requests
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Workspace credit activity</h2>
        {data.usage.length ? (
          <ul className="data-list">
            {data.usage.map((item) => (
              <li key={String(item.id)}>
                <div>
                  <strong>
                    {item.status === 'completed'
                      ? 'Workspace task completed'
                      : item.status === 'refunded'
                        ? 'Workspace credit returned'
                        : 'Workspace task in progress'}
                  </strong>
                  <small>{accountDate(String(item.created_at), timezone)}</small>
                </div>
                <span className="badge">{String(item.status)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-state">No Workspace credit usage yet. Activity appears here after you use Workspace.</p>
        )}
      </section>
    </div>
  );
}
