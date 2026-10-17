'use server';
import { currentUser } from '@/lib/session';
import { prepareEnrollment,completeEnrollment } from '@/lib/subscription-enrollment';
import { throttle } from '@/lib/auth-service';
import { revalidatePath } from 'next/cache';
export async function prepareSubscription(key:string,mode:'trial'|'paid') {
  const user=await currentUser();if(!user)throw new Error('Please sign in first.');
  if(!['trial','paid'].includes(mode))throw new Error('Choose trial or subscription.');
  await throttle(`enroll:${user.id}`,20);
  try{return {data:await prepareEnrollment(user.id,key,mode)};}catch(error){return {error:error instanceof Error?error.message:'Unable to start subscription checkout.'};}
}
export async function finishSubscription(sessionId:string) {
  const user=await currentUser();if(!user)throw new Error('Please sign in first.');
  await throttle(`subscribe:${user.id}`,20);
  try{const data=await completeEnrollment(user.id,sessionId);revalidatePath('/dashboard/billing');revalidatePath('/');return {data};}catch(error){return {error:error instanceof Error?error.message:'Unable to finish checkout.'};}
}
