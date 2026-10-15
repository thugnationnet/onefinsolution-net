import Link from 'next/link';
import { currentUser } from '@/lib/session';
import { ownedQuery } from '@/lib/db';
import { readPreferences } from '@/lib/account-service';
import { accountDate } from '@/lib/dashboard';
import { redirect } from 'next/navigation';
import { PageHeading } from '@/components/page-heading';
import { ConversationList } from '@/components/conversation-list';
import { defaultPreferences } from '@/lib/account-preferences';

export default async function Activity() {
  const user = await currentUser();
  if (!user) redirect('/sign-in');

  let chats: Array<{ id: string; name: string | null; updated_at: string }> = [];
  let timezone = defaultPreferences.timezone;
  try {
    const [rows, settings] = await Promise.all([
      ownedQuery<{ id: string; name: string | null; updated_at: string }>(
        user.id,
        'select id, name, updated_at::text from chats where user_id=$1 order by updated_at desc',
        [user.id],
      ),
      readPreferences(user.id),
    ]);
    chats = rows;
    timezone = settings.timezone || defaultPreferences.timezone;
  } catch {
    chats = [];
  }

  return (
    <div className="page-wrap">
      <PageHeading
        eyebrow="DASHBOARD / ACTIVITY"
        title="Pick up where you left off."
        description="Search, reopen, or delete your saved conversations."
      />
      <div className="button-row">
        <Link className="button" href="/">
          New conversation
        </Link>
        <Link className="text-link" href="/dashboard">
          Back to dashboard
        </Link>
      </div>
      <div className="panel">
        <ConversationList
          chats={chats.map((chat) => ({
            id: chat.id,
            name: chat.name || 'Untitled conversation',
            updated: accountDate(chat.updated_at, timezone),
          }))}
        />
      </div>
    </div>
  );
}
