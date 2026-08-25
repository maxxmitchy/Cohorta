import { IDiscoveryQueryRepository } from '../repositories/IDiscoveryQueryRepository';
import { CommunityDiscoveryReadModel } from '../readmodels/CommunityDiscoveryReadModel';
import { RankingService, SortCriteria } from './RankingService';

export class DiscoveryService {
  constructor(
    private readonly discoveryRepo: IDiscoveryQueryRepository,
    private readonly rankingService: RankingService
  ) {}

  /**
   * Fetches the discovery feed from the read model repository
   * and delegates sorting to the RankingService.
   */
  public async getDiscoveryFeed(sortBy: SortCriteria): Promise<CommunityDiscoveryReadModel[]> {
    const dtos = await this.discoveryRepo.getDiscoveryFeed();
    return this.rankingService.sortCommunities(dtos, sortBy);
  }
}
