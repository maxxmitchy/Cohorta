import { CommunityDiscoveryReadModel } from '../readmodels/CommunityDiscoveryReadModel';

export type SortCriteria = 'trending' | 'active' | 'new' | 'growing';

/**
 * Interface for ranking strategies. This allows the ranking algorithm
 * to evolve independently of the core service.
 */
export interface IRankingStrategy {
  calculateScore(community: CommunityDiscoveryReadModel): number;
}

/**
 * PROVISIONAL RANKING MODEL
 * 
 * This is a temporary algorithm to validate the MVP.
 * It uses a simple weighted sum of weekly growth and active users, multiplied by a rating factor.
 * 
 * Production Ranking System Requirements (Future):
 * - Growth velocity (acceleration of new members over a sliding window)
 * - Engagement velocity (messages/events relative to community size)
 * - Learner retention (30-day cohort survival rate)
 * - Learner satisfaction (weighted NLP on reviews, not just 1-5 stars)
 * - Recent activity freshness (decay factor for older communities)
 * - Mentor utilization rate
 */
export class ProvisionalTrendingStrategy implements IRankingStrategy {
  public calculateScore(community: CommunityDiscoveryReadModel): number {
    const growthWeight = community.weeklyGrowthPercentage * 2;
    const activityWeight = community.activeToday * 0.5;
    const ratingMultiplier = community.rating > 0 ? (community.rating / 5) : 0.5;
    
    return (growthWeight + activityWeight) * ratingMultiplier;
  }
}

export class RankingService {
  constructor(
    private readonly trendingStrategy: IRankingStrategy = new ProvisionalTrendingStrategy()
  ) {}

  /**
   * Sorts a list of communities based on the specified criteria.
   * Note: In production with large datasets, sorting must occur at the persistence/search-index
   * layer (e.g. Elasticsearch/Redis), not in-memory on the application server.
   */
  public sortCommunities(communities: CommunityDiscoveryReadModel[], criteria: SortCriteria): CommunityDiscoveryReadModel[] {
    const sorted = [...communities];

    switch (criteria) {
      case 'active':
        return sorted.sort((a, b) => b.activeToday - a.activeToday);
      case 'growing':
        return sorted.sort((a, b) => b.weeklyGrowthPercentage - a.weeklyGrowthPercentage);
      case 'new':
        return sorted.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      case 'trending':
        return sorted.sort((a, b) => this.trendingStrategy.calculateScore(b) - this.trendingStrategy.calculateScore(a));
      default:
        return sorted;
    }
  }
}
