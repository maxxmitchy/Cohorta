import { CommunityDiscoveryReadModel } from '../readmodels/CommunityDiscoveryReadModel';

export interface IDiscoveryQueryRepository {
  /**
   * Retrieves the aggregated read models for the discovery feed.
   * This method acts as a single, efficient query boundary to prevent N+1 issues
   * that arise when fetching communities and then individually fetching stats/categories.
   */
  getDiscoveryFeed(): Promise<CommunityDiscoveryReadModel[]>;
}
