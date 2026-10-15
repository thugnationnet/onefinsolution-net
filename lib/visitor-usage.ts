import 'server-only';
import { randomUUID } from 'node:crypto';
import { query } from './db';

export async function reserveVisitor(identities: string[]) {
  const id = randomUUID();
  await query(
    "insert into visitor_requests(id,identities,day,status) values($1,$2,(now() at time zone 'UTC')::date,'reserved')",
    [id, identities],
  );
  return id;
}

export async function finishVisitor(id: string, success: boolean) {
  await query(
    "update visitor_requests set status=$2 where id=$1 and status='reserved'",
    [id, success ? 'completed' : 'refunded'],
  );
}

export async function reconcileVisitorUsage() {
  const pending = await query(
    "select id from visitor_requests where status='reserved' and created_at<now()-interval '10 minutes' limit 100",
  );
  for (const row of pending) await finishVisitor(row.id, false);
  await query("delete from visitor_requests where created_at<now()-interval '32 days'");
  await query("delete from visitor_usage where day<(now() at time zone 'UTC')::date-32");
}
