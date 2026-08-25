import { describe, it, expect, vi } from 'vitest';
import { CommunityDetailService } from './CommunityDetailService';
import { ICommunityDetailQueryRepository } from '../repositories/ICommunityDetailQueryRepository';
import { CommunityDetailReadModel } from '../readmodels/CommunityDetailReadModel';

describe('CommunityDetailService', () => {
  it('should fetch the community detail read model from the repository', async () => {
    const mockDetail: CommunityDetailReadModel = {
      id: 'com_1',
      name: 'Test Community',
      description: 'Test description',
      categoryName: 'Test Category',
      skillLevel: 'Beginner',
      memberCount: 100,
      activeToday: 10,
      creatorName: 'Test Creator',
      creatorRole: 'Community Leader',
      roadmap: [],
      alternativePricing: [],
      primaryPricing: { type: 'free' },
      hasFreeEntry: false,
      integrationStatus: 'not_connected',
      createdAt: new Date(),
    };

    const mockRepo: ICommunityDetailQueryRepository = {
      getCommunityDetail: vi.fn().mockResolvedValue(mockDetail),
    };

    const service = new CommunityDetailService(mockRepo);
    const result = await service.getCommunityDetail('com_1');

    expect(result).toEqual(mockDetail);
    expect(mockRepo.getCommunityDetail).toHaveBeenCalledWith('com_1');
  });

  it('should return null if the community is not found', async () => {
    const mockRepo: ICommunityDetailQueryRepository = {
      getCommunityDetail: vi.fn().mockResolvedValue(null),
    };

    const service = new CommunityDetailService(mockRepo);
    const result = await service.getCommunityDetail('com_unknown');

    expect(result).toBeNull();
  });
});
