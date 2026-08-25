import { ICommunityRepository } from '../repositories/ICommunityRepository';
import { CommunityDiscoveryDTO } from '../dto/CommunityDiscoveryDTO';
import { RankingService, SortCriteria } from './RankingService';

export class DiscoveryService {
  constructor(
    private readonly communityRepo: ICommunityRepository,
    private readonly rankingService: RankingService
  ) {}

  /**
   * Fetches the raw domain entities, merges them into the UI DTO, 
   * and delegates sorting to the RankingService.
   */
  public async getDiscoveryFeed(sortBy: SortCriteria): Promise<CommunityDiscoveryDTO[]> {
    const communities = await this.communityRepo.getAllCommunities();
    
    // In production, this "join" would happen at the database level.
    // We orchestrate it here for the mock implementation.
    const dtos: CommunityDiscoveryDTO[] = await Promise.all(
      communities.map(async (community) => {
        const metrics = await this.communityRepo.getMetricsForCommunity(community.id);
        const category = await this.communityRepo.getCategoryById(community.categoryId);
        const plans = await this.communityRepo.getPlansForCommunity(community.id);
        
        // Find lowest price
        let lowestPrice = -1;
        plans.forEach(plan => {
          if (plan.type === 'free') lowestPrice = 0;
          else if (lowestPrice === -1 || plan.priceAmount < lowestPrice) lowestPrice = plan.priceAmount;
        });
        
        return {
          id: community.id,
          name: community.name,
          description: community.description,
          categoryName: category?.name || 'Unknown',
          skillLevel: community.skillLevel,
          memberCount: metrics?.memberCount || 0,
          activeToday: metrics?.activeToday || 0,
          weeklyGrowthPercentage: metrics?.weeklyGrowthPercentage || 0,
          rating: metrics?.rating || 0,
          currentTopic: metrics?.currentTopic || '',
          lowestPriceMonthly: lowestPrice === -1 ? 0 : (lowestPrice / 100), // convert cents to dollars
          createdAt: community.createdAt,
        };
      })
    );

    return this.rankingService.sortCommunities(dtos, sortBy);
  }
}
