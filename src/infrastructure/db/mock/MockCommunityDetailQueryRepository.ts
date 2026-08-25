import { ICommunityDetailQueryRepository } from '../../../core/repositories/ICommunityDetailQueryRepository';
import { CommunityDetailReadModel } from '../../../core/readmodels/CommunityDetailReadModel';
import { mockCommunities, mockCategories, mockMetrics, mockPlans, mockRoadmapItems, mockUsers } from './mockData';
import { determineDisplayPricing } from './pricingHelper';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class MockCommunityDetailQueryRepository implements ICommunityDetailQueryRepository {
  async getCommunityDetail(communityId: string): Promise<CommunityDetailReadModel | null> {
    await delay(300); // Simulate network latency

    const community = mockCommunities.find(c => c.id === communityId);
    if (!community) return null;

    const category = mockCategories.find(c => c.id === community.categoryId);
    const creator = mockUsers.find(u => u.id === community.creatorId);
    const stats = mockMetrics[communityId];
    const plans = mockPlans.filter(p => p.communityId === communityId);
    
    // Sort roadmap items by orderIndex to ensure correct display order
    const roadmap = mockRoadmapItems
      .filter(r => r.communityId === communityId)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map(r => ({
        id: r.id,
        title: r.title,
        description: r.description,
        orderIndex: r.orderIndex,
        status: r.status,
      }));

    const displayPricing = determineDisplayPricing(plans);
    const allPricingOptions = plans.map(p => ({
      type: p.type as 'free' | 'paid',
      amount: p.priceAmount,
      currency: p.priceCurrency,
      interval: p.interval as 'month' | 'year' | 'lifetime' | undefined,
    }));

    return {
      id: community.id,
      name: community.name,
      description: community.description,
      categoryName: category?.name || 'Unknown',
      skillLevel: community.skillLevel,
      memberCount: stats?.memberCount || 0,
      activeToday: stats?.activeToday || 0,
      currentTopic: community.currentTopic,
      creatorName: creator?.name || 'Unknown Creator',
      creatorRole: 'Community Leader',
      roadmap,
      pricing: allPricingOptions, // Allow the UI to see all options for the join card
      hasFreeEntry: plans.some(p => p.type === 'free'),
      integrationStatus: 'not_connected', // Mapped from missing domain for now, until real integration
      createdAt: community.createdAt,
    };
  }
}
