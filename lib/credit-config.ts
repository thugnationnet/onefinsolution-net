export type CreditPlan = { credits: number; kind: 'pack' };
export function creditPlans(): Record<string, CreditPlan> {
  const plans: unknown = JSON.parse(process.env.STRIPE_CREDIT_PLANS || '{}');
  if (!plans || typeof plans !== 'object' || Array.isArray(plans)) throw new Error('Invalid STRIPE_CREDIT_PLANS.');
  for (const [price, plan] of Object.entries(plans)) {
    if (!/^price_[a-zA-Z0-9]+$/.test(price) || !plan || typeof plan !== 'object' ||
      !Number.isSafeInteger(plan.credits) || plan.credits < 1 || plan.credits > 100000000 ||
      plan.kind !== 'pack') throw new Error('Invalid STRIPE_CREDIT_PLANS.');
  }
  return plans as Record<string, CreditPlan>;
}
export function signupCredits(): number {
  return integerSetting('SIGNUP_CREDITS', 0, 0);
}
export function workspaceCreditCost(): number {
  const configured = process.env.WORKSPACE_CREDIT_COST ?? process.env.CHAT_CREDIT_COST;
  const value = Number(configured ?? 1);
  if (!Number.isSafeInteger(value) || value < 1 || value > 100000000) throw new Error('Invalid WORKSPACE_CREDIT_COST.');
  return value;
}
function integerSetting(name: string, fallback: number, minimum: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < minimum || value > 100000000) throw new Error(`Invalid ${name}.`);
  return value;
}
