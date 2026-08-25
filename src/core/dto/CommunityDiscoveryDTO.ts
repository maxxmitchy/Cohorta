/**
 * DTO for the Community Discovery feed.
 * Aggregates data from Community, CommunityMetrics, Category, and MembershipPlan
 * so the UI components remain decoupled from the raw database schema.
 */
export interface CommunityDiscoveryDTO {
  id: string;
  name: string;
  description: string;
  categoryName: string;
  skillLevel: string;
  memberCount: number;
  activeToday: number;
  weeklyGrowthPercentage: number;
  rating: number;
  currentTopic: string;
  lowestPriceMonthly: number; // 0 if free plan exists
  createdAt: Date;
}
