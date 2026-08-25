import { describe, it, expect, vi } from 'vitest';
import { MembershipService } from './MembershipService';
import { IMembershipRepository } from '../repositories/IMembershipRepository';
import { IMembershipQueryRepository } from '../repositories/IMembershipQueryRepository';
import { Membership } from '../domain/membership';
import { MemberCommunityReadModel } from '../readmodels/MemberCommunityReadModel';
import { LearningProgress } from '../domain/progress';

describe('MembershipService', () => {
  it('should return null if user is not a member', async () => {
    const mockRepo: IMembershipRepository = {
      getMembership: vi.fn().mockResolvedValue(null),
      createMembership: vi.fn().mockResolvedValue(undefined),
      initializeProgress: vi.fn().mockResolvedValue(undefined),
      getRoadmapItemIds: vi.fn().mockResolvedValue([]),
    };
    const mockQueryRepo: IMembershipQueryRepository = {
      getMemberCommunityView: vi.fn().mockResolvedValue(null)
    };
    
    const service = new MembershipService(mockRepo, mockQueryRepo);
    
    const membership = await service.getMembership('u_visitor', 'com_1');
    expect(membership).toBeNull();
    
    const view = await service.getMemberCommunityView('u_visitor', 'com_1');
    expect(view).toBeNull();
  });

  it('should return active membership state', async () => {
    const mockMembership: Membership = {
      id: 'm1',
      userId: 'u_member_partial',
      communityId: 'com_1',
      planId: 'plan_1',
      role: 'member',
      joinedAt: new Date(),
      status: 'active'
    };
    
    const mockView: MemberCommunityReadModel = {
      communityId: 'com_1',
      name: 'Test Community',
      categoryName: 'Tech',
      activeToday: 10,
      membershipStatus: 'active',
      memberRole: 'member',
      joinedAt: new Date(),
      roadmap: [],
      totalItems: 0,
      completedItems: 0
    };

    const mockRepo: IMembershipRepository = {
      getMembership: vi.fn().mockResolvedValue(mockMembership),
      createMembership: vi.fn().mockResolvedValue(undefined),
      initializeProgress: vi.fn().mockResolvedValue(undefined),
      getRoadmapItemIds: vi.fn().mockResolvedValue([]),
    };
    const mockQueryRepo: IMembershipQueryRepository = {
      getMemberCommunityView: vi.fn().mockResolvedValue(mockView)
    };
    
    const service = new MembershipService(mockRepo, mockQueryRepo);
    
    const view = await service.getMemberCommunityView('u_member_partial', 'com_1');
    expect(view?.membershipStatus).toBe('active');
  });

  it('should prevent joining if already an active member', async () => {
    const mockMembership: Membership = {
      id: 'm1',
      userId: 'u_member',
      communityId: 'com_1',
      planId: 'plan_1',
      role: 'member',
      joinedAt: new Date(),
      status: 'active'
    };

    const mockRepo: IMembershipRepository = {
      getMembership: vi.fn().mockResolvedValue(mockMembership),
      createMembership: vi.fn().mockResolvedValue(undefined),
      initializeProgress: vi.fn().mockResolvedValue(undefined),
      getRoadmapItemIds: vi.fn().mockResolvedValue([]),
    };
    const mockQueryRepo: IMembershipQueryRepository = {
      getMemberCommunityView: vi.fn().mockResolvedValue(null)
    };
    
    const service = new MembershipService(mockRepo, mockQueryRepo);
    
    await expect(service.joinCommunity('u_member', 'com_1')).rejects.toThrow('already an active member');
  });

  it('should create membership and progress when joining', async () => {
    const createMembershipMock = vi.fn().mockResolvedValue(undefined);
    const initializeProgressMock = vi.fn().mockResolvedValue(undefined);

    const mockRepo: IMembershipRepository = {
      getMembership: vi.fn().mockResolvedValue(null),
      createMembership: createMembershipMock,
      initializeProgress: initializeProgressMock,
      getRoadmapItemIds: vi.fn().mockResolvedValue(['item1', 'item2']),
    };
    const mockQueryRepo: IMembershipQueryRepository = {
      getMemberCommunityView: vi.fn().mockResolvedValue(null)
    };
    
    const service = new MembershipService(mockRepo, mockQueryRepo);
    
    await service.joinCommunity('u_visitor', 'com_1', 'plan_free');

    expect(createMembershipMock).toHaveBeenCalledTimes(1);
    const createdMembership = createMembershipMock.mock.calls[0][0];
    expect(createdMembership.userId).toBe('u_visitor');
    expect(createdMembership.communityId).toBe('com_1');
    expect(createdMembership.planId).toBe('plan_free');
    expect(createdMembership.status).toBe('active');

    expect(initializeProgressMock).toHaveBeenCalledTimes(1);
    const initializedProgress = initializeProgressMock.mock.calls[0][0] as LearningProgress[];
    expect(initializedProgress).toHaveLength(2);
    expect(initializedProgress[0].status).toBe('current');
    expect(initializedProgress[1].status).toBe('locked');
  });
});
