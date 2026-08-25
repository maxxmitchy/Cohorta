import { PricingDisplay } from '../../core/readmodels/CommunityDiscoveryReadModel';

export function formatPricing(pricing: PricingDisplay): string {
  if (pricing.type === 'free') return 'Free';
  if (pricing.amount == null || !pricing.currency) return 'Paid';
  
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: pricing.currency,
    minimumFractionDigits: 0,
  }).format(pricing.amount / 100);

  const intervalSuffix = pricing.interval === 'month' ? '/mo' : pricing.interval === 'year' ? '/yr' : pricing.interval === 'lifetime' ? ' once' : '';
  return `${formatted}${intervalSuffix}`;
}
