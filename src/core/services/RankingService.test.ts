import { describe, it, expect } from 'vitest';
import { RankingService } from './RankingService';
import { CommunityDiscoveryDTO } from '../dto/CommunityDiscoveryDTO';

describe('RankingService', () => {
  const mockCommunities: CommunityDiscoveryDTO[] = [
    {
      id: '1',
      name: 'High Growth',
      description: '',
      categoryName: 'Tech',
      skillLevel: 'Beginner',
      memberCount: 100,
      activeToday: 50,
      weeklyGrowthPercentage: 100,
      rating: 5,
      currentTopic: '',
      lowestPriceMonthly: 0,
      createdAt: new Date('2024-01-01'),
    },
    {
      id: '2',
      name: 'High Activity',
      description: '',
      categoryName: 'Tech',
      skillLevel: 'Beginner',
      memberCount: 1000,
      activeToday: 500,
      weeklyGrowthPercentage: 5,
      rating: 4,
      currentTopic: '',
      lowestPriceMonthly: 0,
      createdAt: new Date('2024-02-01'),
    }
  ];

  const rankingService = new RankingService();

  it('sorts by active today correctly', () => {
    const result = rankingService.sortCommunities(mockCommunities, 'active');
    expect(result[0].id).toBe('2'); // 500 active > 50 active
  });

  it('sorts by growth correctly', () => {
    const result = rankingService.sortCommunities(mockCommunities, 'growing');
    expect(result[0].id).toBe('1'); // 100% growth > 5% growth
  });
  
  it('trending score favors growth over raw activity based on current weights', () => {
    const result = rankingService.sortCommunities(mockCommunities, 'trending');
    // High Growth: (100 * 2) + (50 * 0.5) = 225. 225 * 1 = 225
    // High Activity: (5 * 2) + (500 * 0.5) = 260. 260 * 0.8 = 208
    expect(result[0].id).toBe('1');
  });
});
