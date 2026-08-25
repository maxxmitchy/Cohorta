import { CommunityDiscoveryDTO } from '../dto/CommunityDiscoveryDTO';

export type SortCriteria = 'trending' | 'active' | 'new' | 'growing';

export class RankingService {
  /**
   * Sorts a list of communities based on the specified criteria.
   * In a production environment with millions of rows, this logic would 
   * live in the database query or a dedicated search index (e.g., Elasticsearch/Redis).
   */
  public sortCommunities(communities: CommunityDiscoveryDTO[], criteria: SortCriteria): CommunityDiscoveryDTO[] {
    const sorted = [...communities];

    switch (criteria) {
      case 'active':
        return sorted.sort((a, b) => b.activeToday - a.activeToday);
      case 'growing':
        return sorted.sort((a, b) => b.weeklyGrowthPercentage - a.weeklyGrowthPercentage);
      case 'new':
        return sorted.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      case 'trending':
        // A composite score of growth, recent activity, and rating.
        return sorted.sort((a, b) => this.calculateTrendingScore(b) - this.calculateTrendingScore(a));
      default:
        return sorted;
    }
  }

  private calculateTrendingScore(community: CommunityDiscoveryDTO): number {
    // Arbitrary weighting for MVP: Growth is king, followed by raw active users.
    const growthWeight = community.weeklyGrowthPercentage * 2;
    const activityWeight = community.activeToday * 0.5;
    const ratingMultiplier = community.rating > 0 ? (community.rating / 5) : 0.5;
    
    return (growthWeight + activityWeight) * ratingMultiplier;
  }
}
