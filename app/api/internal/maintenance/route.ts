import { runDueWorkspaceAutoReloads } from '@/lib/workspace-auto-reload';
import { timingSafeEqual } from 'node:crypto';
import { deliverBillingNotices } from '@/lib/billing-notices';
import { reconcileVisitorUsage } from '@/lib/visitor-usage';
export async function POST(request:Request){
  const expected=process.env.WORKSPACE_SIGNING_KEY||'',provided=request.headers.get('authorization')?.replace(/^Bearer /,'')||'';
  if(expected.length<32||Buffer.byteLength(expected)!==Buffer.byteLength(provided)||!timingSafeEqual(Buffer.from(expected),Buffer.from(provided)))return Response.json({error:'Unauthorized'},{status:401});
  await reconcileVisitorUsage();const billingNotices=await deliverBillingNotices();const workspaceAutoReloads=await runDueWorkspaceAutoReloads();return Response.json({billingNotices,workspaceAutoReloads});
}
