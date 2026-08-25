import { describe, it, expect, vi } from 'vitest';
import { DiscoveryService } from './DiscoveryService';
import { RankingService } from './RankingService';
import { IDiscoveryQueryRepository } from '../repositories/IDiscoveryQueryRepository';
import { CommunityDiscoveryReadModel } from '../readmodels/CommunityDiscoveryReadModel';

describe('DiscoveryService', () => {
  it('fetches feed and delegates sorting to ranking service', async () => {
    const mockFeed: CommunityDiscoveryReadModel[] = [
      {
        id: '1',
        name: 'Test',
        description: '',
        categoryName: 'Tech',
        skillLevel: 'Beginner',
        memberCount: 10,
        activeToday: 5,
        weeklyGrowthPercentage: 1,
        rating: 5,
        pricing: { type: 'free' },
        createdAt: new Date(),
      }
    ];

    const mockRepo: IDiscoveryQueryRepository = {
      getDiscoveryFeed: vi.fn().mockResolvedValue(mockFeed)
    };

    const mockRankingService = new RankingService();
    // Spy on sort method
    const sortSpy = vi.spyOn(mockRankingService, 'sortCommunities');

    const service = new DiscoveryService(mockRepo, mockRankingService);
    const result = await service.getDiscoveryFeed('trending');

    expect(mockRepo.getDiscoveryFeed).toHaveBeenCalled();
    expect(sortSpy).toHaveBeenCalledWith(mockFeed, 'trending');
    expect(result).toHaveLength(1);
  });
});
