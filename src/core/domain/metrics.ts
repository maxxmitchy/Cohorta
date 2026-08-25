export interface CommunityStats {
  communityId: string;
  memberCount: number;
  activeToday: number;
  weeklyGrowthPercentage: number;
  rating: number;
  reviewCount: number;
  lastCalculatedAt: Date;
}
