import { IDiscoveryQueryRepository } from '../../../core/repositories/IDiscoveryQueryRepository';
import { CommunityDiscoveryReadModel } from '../../../core/readmodels/CommunityDiscoveryReadModel';
import { mockCommunities, mockCategories, mockMetrics, mockPlans } from './mockData';
import { determineDisplayPricing } from './pricingHelper';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class MockDiscoveryQueryRepository implements IDiscoveryQueryRepository {
  async getDiscoveryFeed(): Promise<CommunityDiscoveryReadModel[]> {
    await delay(300); // Simulate network latency

    // In a real implementation (e.g. Postgres), this would be a single SQL query
    // with JOINS to prevent the N+1 problem. Here we simulate the joined result.
    return mockCommunities.map(community => {
      const category = mockCategories.find(c => c.id === community.categoryId);
      const stats = mockMetrics[community.id];
      const plans = mockPlans.filter(p => p.communityId === community.id);
      
      const displayPricing = determineDisplayPricing(plans);

      return {
        id: community.id,
        name: community.name,
        description: community.description,
        categoryName: category?.name || 'Unknown',
        skillLevel: community.skillLevel,
        memberCount: stats?.memberCount || 0,
        activeToday: stats?.activeToday || 0,
        weeklyGrowthPercentage: stats?.weeklyGrowthPercentage || 0,
        rating: stats?.rating || 0,
        currentTopic: community.currentTopic,
        pricing: displayPricing,
        createdAt: community.createdAt,
      };
    });
  }
}
