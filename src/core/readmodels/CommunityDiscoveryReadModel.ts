/**
 * Represents pricing in a currency-aware format for presentation.
 */
export interface PricingDisplay {
  type: 'free' | 'paid';
  amount?: number; // In smallest currency unit (e.g., cents)
  currency?: string; // ISO 4217 currency code (e.g., 'USD')
  interval?: 'month' | 'year' | 'lifetime';
}

/**
 * Read Model for the Community Discovery feed.
 * This is an aggregated view optimized for reading, specifically designed
 * to prevent N+1 queries by flattening the necessary data into a single object.
 */
export interface CommunityDiscoveryReadModel {
  id: string;
  name: string;
  description: string;
  categoryName: string;
  skillLevel: string;
  memberCount: number;
  activeToday: number;
  weeklyGrowthPercentage: number;
  rating: number;
  currentTopic?: string;
  pricing: PricingDisplay;
  createdAt: Date;
}
