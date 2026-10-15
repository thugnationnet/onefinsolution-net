import {query} from '@/lib/db';
export const dynamic='force-dynamic';
export async function GET() {
 try {
  const [state]=await query('select count(*)::int as count from app_migrations');
  if(state.count<5) throw new Error('Pending migration.');
  return Response.json({status:'ok',database:'connected'});
 } catch { return Response.json({status:'unavailable',database:'unavailable'},{status:503}); }
}
