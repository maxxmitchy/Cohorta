import { describe, it, expect, vi } from 'vitest';
import { MembershipService } from './MembershipService';
import { IMembershipRepository } from '../repositories/IMembershipRepository';
import { IMembershipQueryRepository } from '../repositories/IMembershipQueryRepository';
import { Membership } from '../domain/membership';
import { MemberCommunityReadModel } from '../readmodels/MemberCommunityReadModel';

describe('MembershipService', () => {
  it('should return null if user is not a member', async () => {
    const mockRepo: IMembershipRepository = {
      getMembership: vi.fn().mockResolvedValue(null)
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
      getMembership: vi.fn().mockResolvedValue(mockMembership)
    };
    const mockQueryRepo: IMembershipQueryRepository = {
      getMemberCommunityView: vi.fn().mockResolvedValue(mockView)
    };
    
    const service = new MembershipService(mockRepo, mockQueryRepo);
    
    const view = await service.getMemberCommunityView('u_member_partial', 'com_1');
    expect(view?.membershipStatus).toBe('active');
  });
});
