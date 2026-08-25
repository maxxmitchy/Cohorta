import { MembershipPlan } from '../../../core/domain/membership';
import { PricingDisplay } from '../../../core/readmodels/CommunityDiscoveryReadModel';

/**
 * Determines the safest and most accurate pricing display for a community
 * based on its available membership plans.
 * 
 * Rules:
 * 1. If no plans exist, return unknown/paid.
 * 2. If a free plan exists, the community is free to enter -> return free.
 * 3. If multiple currencies exist, do NOT compare their raw amounts. 
 *    Select the first currency found and determine the lowest price within that currency.
 */
export function determineDisplayPricing(plans: MembershipPlan[]): PricingDisplay {
  if (!plans || plans.length === 0) {
    return { type: 'paid' }; // Missing pricing defaults to paid, no amount assumed
  }

  // If any plan is free, the community has a free entry tier
  const hasFree = plans.some(p => p.type === 'free');
  if (hasFree) {
    return { type: 'free' };
  }

  // Filter for valid paid plans
  const paidPlans = plans.filter(p => (p.type === 'subscription' || p.type === 'one_time') && p.priceCurrency != null);
  
  if (paidPlans.length === 0) {
    return { type: 'paid' };
  }

  // Group by currency to prevent dangerous cross-currency numerical comparisons
  const plansByCurrency = new Map<string, MembershipPlan[]>();
  for (const plan of paidPlans) {
    const curr = plan.priceCurrency.toUpperCase();
    if (!plansByCurrency.has(curr)) {
      plansByCurrency.set(curr, []);
    }
    plansByCurrency.get(curr)!.push(plan);
  }

  // Select the first currency encountered as the display base
  const firstCurrency = Array.from(plansByCurrency.keys())[0];
  const comparablePlans = plansByCurrency.get(firstCurrency)!;

  let lowestPricePlan = comparablePlans[0];

  for (let i = 1; i < comparablePlans.length; i++) {
    const current = comparablePlans[i];
    
    // We prefer monthly pricing as the standard "display" interval if available
    if (current.interval === 'month' && lowestPricePlan.interval !== 'month') {
      lowestPricePlan = current;
    } 
    // If intervals match, compare amounts directly
    else if (current.interval === lowestPricePlan.interval && current.priceAmount < lowestPricePlan.priceAmount) {
      lowestPricePlan = current;
    }
  }

  return {
    type: 'paid',
    amount: lowestPricePlan.priceAmount,
    currency: lowestPricePlan.priceCurrency.toUpperCase(),
    interval: lowestPricePlan.interval as 'month' | 'year' | 'one_time' | undefined
  };
}
