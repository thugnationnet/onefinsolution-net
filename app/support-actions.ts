'use server';
import { currentUser } from '@/lib/session';
import { submitSupportRequest } from '@/lib/support-service';
import { headers } from 'next/headers';
export type SupportResult = { error?:string; reference?:string };
export async function contactAction(_previous:SupportResult,form:FormData):Promise<SupportResult> {
  try {
    const user=await currentUser();
    const ip=(await headers()).get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
    return {reference:await submitSupportRequest(form,user,ip)};
  } catch(error) {
    const message=error instanceof Error?error.message:'';
    return {error:/^(Enter |Too many |Unable to submit)/.test(message)?message:'Your request could not be recorded. Please try again later; no confirmation has been issued.'};
  }
}
