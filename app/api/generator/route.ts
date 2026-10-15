import {getAIResponse} from '@/app/actions';
import {siteUrl} from '@/lib/site-url';
export async function POST(request:Request) {
 if(request.headers.get('origin')!==siteUrl()) return Response.json({error:'Invalid request origin.'},{status:403});
 let body;
 try {body=await request.json();} catch {return Response.json({error:'Invalid JSON.'},{status:400});}
 if(typeof body.prompt!=='string' || !body.prompt.trim() || body.prompt.length>32000) return Response.json({error:'Enter a prompt up to 32000 characters.'},{status:400});
 const result=await getAIResponse([{id:'generation',sender:'user',content:body.prompt}],'default');
 return Response.json(result,{status:result.success?200:503});
}
