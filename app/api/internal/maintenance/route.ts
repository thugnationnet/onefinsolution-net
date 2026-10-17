import { timingSafeEqual } from 'node:crypto';
import { runDueWorkspaceAutoReloads } from '@/lib/workspace-auto-reload';
import { deliverBillingNotices } from '@/lib/billing-notices';
import { reconcileVisitorUsage } from '@/lib/visitor-usage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function authorized(request: Request): boolean {
  const expected = process.env.WORKSPACE_SIGNING_KEY || '';
  const provided =
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    request.headers.get('x-maintenance-key') ||
    '';
  if (expected.length < 32) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Cron / ops endpoint: visitor reconcile, billing notice emails, workspace auto-reload.
 * Secure with WORKSPACE_SIGNING_KEY bearer token (Railway cron or external scheduler).
 */
export async function POST(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await reconcileVisitorUsage();
  } catch (error) {
    console.error('[maintenance] reconcileVisitorUsage failed', error);
  }

  let billingNotices: unknown = null;
  let workspaceAutoReloads: unknown = null;
  const errors: string[] = [];

  try {
    billingNotices = await deliverBillingNotices();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`billingNotices:${message}`);
    console.error('[maintenance] deliverBillingNotices failed', error);
  }

  try {
    workspaceAutoReloads = await runDueWorkspaceAutoReloads();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`workspaceAutoReloads:${message}`);
    console.error('[maintenance] runDueWorkspaceAutoReloads failed', error);
  }

  return Response.json({
    ok: errors.length === 0,
    billingNotices,
    workspaceAutoReloads,
    ...(errors.length ? { errors } : {}),
  });
}

export async function GET() {
  return Response.json(
    { error: 'Method not allowed. Use POST with bearer token.' },
    { status: 405 },
  );
}
