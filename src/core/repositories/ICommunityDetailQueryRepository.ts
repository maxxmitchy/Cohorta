import { CommunityDetailReadModel } from '../readmodels/CommunityDetailReadModel';

export interface ICommunityDetailQueryRepository {
  /**
   * Retrieves the aggregated read model for a specific community detail page.
   * 
   * FUTURE PERSISTENCE REQUIREMENT:
   * Like the discovery feed, the production repository MUST efficiently assemble
   * this data (e.g. via SQL JOINS or document aggregation), avoiding N+1 queries.
   */
  getCommunityDetail(communityId: string): Promise<CommunityDetailReadModel | null>;
}
