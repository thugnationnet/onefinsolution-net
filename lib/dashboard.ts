import 'server-only';
import { query, ownedQuery } from './db';
import { ensureSignupCredits } from './credits';
import { readPreferences } from './account-service';
import { defaultPreferences, type AccountPreferences } from './account-preferences';

async function safeQuery<T>(run: () => Promise<T[]>, fallback: T[] = []): Promise<T[]> {
  try {
    return await run();
  } catch {
    return fallback;
  }
}

export async function dashboardData(userId: string) {
  try {
    await ensureSignupCredits(userId);
  } catch {
    /* credits bootstrap should not block the dashboard */
  }

  const profiles = await safeQuery<{ full_name?: string | null; name?: string | null }>(async () => {
    try {
      return await ownedQuery(userId, 'select full_name from profiles where id=$1', [userId]);
    } catch {
      return await query<{ full_name?: string | null; name?: string | null }>(
        'select coalesce(full_name, name) as full_name from app_users where id=$1',
        [userId],
      );
    }
  });

  const counts = await safeQuery<{ chats: string; contexts: string; responses: string }>(
    () =>
      query(
        `select
           (select count(*) from chats where user_id=$1) as chats,
           (select count(*) from context_items where user_id=$1) as contexts,
           (select count(*) from chat_usage where user_id=$1 and status='completed') as responses`,
        [userId],
      ),
    [{ chats: '0', contexts: '0', responses: '0' }],
  );

  const credits = await safeQuery<{ balance: string }>(async () => {
    try {
      return await ownedQuery(
        userId,
        `select coalesce(sum(remaining),0)::text as balance
         from credit_buckets
         where user_id=$1 and (expires_at is null or expires_at>now())`,
        [userId],
      );
    } catch {
      try {
        return await query<{ balance: string }>('select available_credits($1)::text as balance', [userId]);
      } catch {
        return [{ balance: '0' }];
      }
    }
  }, [{ balance: '0' }]);

  const chats = await safeQuery(() =>
    ownedQuery(
      userId,
      'select id, name, updated_at::text from chats where user_id=$1 order by updated_at desc limit 5',
      [userId],
    ),
  );

  const subscriptions = await safeQuery(() =>
    ownedQuery(
      userId,
      'select id,status,price_id,period_end::text,cancel_at_period_end,observed_at::text from billing_subscriptions where user_id=$1 order by observed_at desc limit 5',
      [userId],
    ),
  );

  const usage = await safeQuery(() =>
    query('select id,status,created_at::text from credit_usage where user_id=$1 order by created_at desc limit 8', [
      userId,
    ]),
  );

  const requests = await safeQuery<{ count: string }>(
    () =>
      ownedQuery(
        userId,
        "select count(*)::text as count from support_requests where user_id=$1 and status<>'resolved'",
        [userId],
      ),
    [{ count: '0' }],
  );

  let preferences: AccountPreferences = { ...defaultPreferences };
  try {
    preferences = await readPreferences(userId);
  } catch {
    preferences = { ...defaultPreferences };
  }

  const chatUsage = await safeQuery(() =>
    query('select id,status,created_at::text from chat_usage where user_id=$1 order by created_at desc limit 8', [
      userId,
    ]),
  );

  return {
    name: profiles[0]?.full_name || profiles[0]?.name || '',
    counts: counts[0] || { chats: '0', contexts: '0', responses: '0' },
    balance: credits[0]?.balance || '0',
    chats,
    subscriptions,
    usage,
    chatUsage,
    openRequests: requests[0]?.count || '0',
    preferences,
  };
}

export function accountDate(value: string, timezone: string) {
  try {
    return new Date(value).toLocaleString('en-US', {
      timeZone: timezone || 'UTC',
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return new Date(value).toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }
}
