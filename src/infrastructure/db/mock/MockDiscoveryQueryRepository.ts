import { IDiscoveryQueryRepository } from '../../../core/repositories/IDiscoveryQueryRepository';
import { CommunityDiscoveryReadModel } from '../../../core/readmodels/CommunityDiscoveryReadModel';
import { mockCommunities, mockCategories, mockMetrics, mockPlans } from './mockData';

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
      
      // Determine base pricing display
      let lowestPrice = -1;
      let lowestCurrency = 'USD';
      let lowestInterval: 'month' | 'year' | 'one_time' | undefined = undefined;
      let hasFree = false;

      plans.forEach(plan => {
        if (plan.type === 'free') {
          hasFree = true;
        } else if (lowestPrice === -1 || plan.priceAmount < lowestPrice) {
          lowestPrice = plan.priceAmount;
          lowestCurrency = plan.priceCurrency;
          lowestInterval = plan.interval as 'month' | 'year' | 'one_time';
        }
      });

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
        pricing: {
          type: hasFree ? 'free' : 'paid',
          amount: lowestPrice > -1 && !hasFree ? lowestPrice : undefined,
          currency: lowestPrice > -1 && !hasFree ? lowestCurrency : undefined,
          interval: lowestPrice > -1 && !hasFree ? lowestInterval : undefined,
        },
        createdAt: community.createdAt,
      };
    });
  }
}
