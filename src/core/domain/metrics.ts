export interface CommunityMetrics {
  communityId: string;
  memberCount: number;
  activeToday: number;
  weeklyGrowthPercentage: number;
  rating: number;
  reviewCount: number;
  currentTopic: string;
  lastCalculatedAt: Date;
}
