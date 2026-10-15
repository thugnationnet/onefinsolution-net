export const plans = [
  { key: 'daily', name: 'Daily', amount: 500, interval: 'day', trialDays: 1 },
  { key: 'weekly', name: 'Weekly', amount: 1300, interval: 'week', trialDays: 3 },
  { key: 'monthly', name: 'Monthly', amount: 3000, interval: 'month', trialDays: 5 },
  { key: 'yearly', name: 'Yearly', amount: 24900, interval: 'year', trialDays: 15 },
  { key: 'custom', name: 'Custom', amount: 0, interval: 'month', trialDays: 0 }, // Custom plan - amount/interval configured dynamically
] as const;
export type PlanKey = typeof plans[number]['key'];
export function findPlan(key: string) {
  const plan = plans.find(value => value.key === key);
  if (!plan) throw new Error('Choose an available plan.');
  return plan;
}
export const priceLabel = (plan: typeof plans[number]) => {
  if (plan.key === 'custom') return 'Custom Plan (contact us)';
  return `$${plan.amount / 100} USD / ${plan.interval}`;
};

export const lookupKey = (key: string) => `onefin_v2_${findPlan(key).key}`;
