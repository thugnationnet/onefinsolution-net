'use server';
import { currentUser } from '@/lib/session';
import { ensureSignupCredits } from '@/lib/credits';
import { query } from '@/lib/db';
export async function getCreditBalance():Promise<{balance:number|null;error?:string}> {
  try {
    const user=await currentUser(); if(!user) return {balance:null,error:'Please sign in.'};
    await ensureSignupCredits(user.id);
    await query('select reconcile_credit_usage($1)',[user.id]);
    const [{balance:value}]=await query('select available_credits($1) as balance',[user.id]);
    const balance=Number(value); if(!Number.isSafeInteger(balance)||balance<0) throw new Error('Invalid balance.');
    return {balance};
  } catch { return {balance:null,error:'Credit balance is temporarily unavailable.'}; }
}
