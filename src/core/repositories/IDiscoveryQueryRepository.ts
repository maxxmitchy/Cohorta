import { CommunityDiscoveryReadModel } from '../readmodels/CommunityDiscoveryReadModel';

export interface IDiscoveryQueryRepository {
  /**
   * Retrieves the aggregated read models for the discovery feed.
   * 
   * FUTURE PERSISTENCE REQUIREMENT:
   * The production repository implementation (e.g. PostgreSQL/Firebase) MUST be 
   * responsible for efficiently assembling this read model.
   * 
   * Do not fetch core entities and then execute N+1 queries to retrieve metrics, 
   * plans, or categories. This should be a single database query (e.g. via SQL JOINS)
   * or a direct read from a pre-calculated index.
   */
  getDiscoveryFeed(): Promise<CommunityDiscoveryReadModel[]>;
}
