import { describe, it, expect } from 'vitest';
import { determineDisplayPricing } from './pricingHelper';
import { MembershipPlan } from '../../../core/domain/membership';

describe('pricingHelper', () => {
  it('returns paid with undefined amount when no plans exist', () => {
    const result = determineDisplayPricing([]);
    expect(result).toEqual({ type: 'paid' });
  });

  it('returns free when only free plan exists', () => {
    const plans: MembershipPlan[] = [
      { id: '1', communityId: 'c1', type: 'free', name: 'Free', priceAmount: 0, priceCurrency: 'USD', isActive: true }
    ];
    const result = determineDisplayPricing(plans);
    expect(result).toEqual({ type: 'free' });
  });

  it('returns free when both free and paid plans exist (free entry point)', () => {
    const plans: MembershipPlan[] = [
      { id: '1', communityId: 'c1', type: 'free', name: 'Free', priceAmount: 0, priceCurrency: 'USD', isActive: true },
      { id: '2', communityId: 'c1', type: 'subscription', name: 'Pro', priceAmount: 1000, priceCurrency: 'USD', interval: 'month', isActive: true }
    ];
    const result = determineDisplayPricing(plans);
    expect(result).toEqual({ type: 'free' });
  });

  it('returns lowest price when multiple paid plans of the same currency and interval exist', () => {
    const plans: MembershipPlan[] = [
      { id: '1', communityId: 'c1', type: 'subscription', name: 'Pro', priceAmount: 2000, priceCurrency: 'USD', interval: 'month', isActive: true },
      { id: '2', communityId: 'c1', type: 'subscription', name: 'Basic', priceAmount: 1000, priceCurrency: 'USD', interval: 'month', isActive: true }
    ];
    const result = determineDisplayPricing(plans);
    expect(result).toEqual({ type: 'paid', amount: 1000, currency: 'USD', interval: 'month' });
  });

  it('prefers monthly over other intervals for display', () => {
    const plans: MembershipPlan[] = [
      { id: '1', communityId: 'c1', type: 'subscription', name: 'Pro Year', priceAmount: 10000, priceCurrency: 'USD', interval: 'year', isActive: true },
      { id: '2', communityId: 'c1', type: 'subscription', name: 'Pro Month', priceAmount: 1000, priceCurrency: 'USD', interval: 'month', isActive: true }
    ];
    const result = determineDisplayPricing(plans);
    expect(result).toEqual({ type: 'paid', amount: 1000, currency: 'USD', interval: 'month' });
  });

  it('safely handles missing or invalid currency on paid plans', () => {
    const plans: MembershipPlan[] = [
      { id: '1', communityId: 'c1', type: 'subscription', name: 'Pro', priceAmount: 1000, isActive: true } as MembershipPlan
    ];
    const result = determineDisplayPricing(plans);
    expect(result).toEqual({ type: 'paid' }); // Invalid plan is ignored
  });

  it('selects the first currency encountered and ignores others (no direct comparison)', () => {
    const plans: MembershipPlan[] = [
      { id: '1', communityId: 'c1', type: 'subscription', name: 'EU', priceAmount: 500, priceCurrency: 'EUR', interval: 'month', isActive: true },
      { id: '2', communityId: 'c1', type: 'subscription', name: 'US', priceAmount: 100, priceCurrency: 'USD', interval: 'month', isActive: true }, // Numerically lower, but different currency
      { id: '3', communityId: 'c1', type: 'subscription', name: 'EU Plus', priceAmount: 600, priceCurrency: 'EUR', interval: 'month', isActive: true }
    ];
    // It should pick EUR because it appears first, and then pick 500 over 600
    const result = determineDisplayPricing(plans);
    expect(result).toEqual({ type: 'paid', amount: 500, currency: 'EUR', interval: 'month' });
  });
});
