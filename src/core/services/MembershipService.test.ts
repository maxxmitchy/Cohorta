import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MembershipService } from './MembershipService';
import { IMembershipRepository } from '../repositories/IMembershipRepository';
import { IMembershipQueryRepository } from '../repositories/IMembershipQueryRepository';
import { IPaymentService, PaymentRequest, PaymentResult } from './IPaymentService';
import { Membership, MembershipPlan } from '../domain/membership';
import { Community } from '../domain/community';
import { MemberCommunityReadModel } from '../readmodels/MemberCommunityReadModel';
import { LearningProgress } from '../domain/progress';

describe('MembershipService', () => {
  let mockRepo: IMembershipRepository;
  let mockQueryRepo: IMembershipQueryRepository;
  let mockPaymentService: IPaymentService;
  let service: MembershipService;

  const validCommunity: Community = {
    id: 'com_1',
    creatorId: 'u_ada',
    categoryId: 'cat_tech',
    name: 'TypeScript Mastery',
    description: 'Learn advanced TS',
    skillLevel: 'Intermediate',
    status: 'active',
    currentTopic: 'Conditional Types',
    tags: ['typescript', 'frontend'],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const validFreePlan: MembershipPlan = {
    id: 'plan_free',
    communityId: 'com_1',
    name: 'Community Access',
    type: 'free',
    priceAmount: 0,
    priceCurrency: 'USD',
    isActive: true,
  };

  const validPaidPlan: MembershipPlan = {
    id: 'plan_paid',
    communityId: 'com_1',
    name: 'Pro Access',
    type: 'subscription',
    priceAmount: 1500, // $15.00
    priceCurrency: 'USD',
    interval: 'month',
    isActive: true,
  };

  const inactivePlan: MembershipPlan = {
    id: 'plan_inactive',
    communityId: 'com_1',
    name: 'Legacy Beta',
    type: 'subscription',
    priceAmount: 500,
    priceCurrency: 'USD',
    isActive: false,
  };

  const otherCommunityPlan: MembershipPlan = {
    id: 'plan_other',
    communityId: 'com_999',
    name: 'Other Community Plan',
    type: 'subscription',
    priceAmount: 2000,
    priceCurrency: 'EUR',
    isActive: true,
  };

  beforeEach(() => {
    mockRepo = {
      getCommunity: vi.fn().mockImplementation(async (id: string) => {
        return id === 'com_1' ? validCommunity : null;
      }),
      getPlan: vi.fn().mockImplementation(async (id: string) => {
        if (id === 'plan_free') return validFreePlan;
        if (id === 'plan_paid') return validPaidPlan;
        if (id === 'plan_inactive') return inactivePlan;
        if (id === 'plan_other') return otherCommunityPlan;
        return null;
      }),
      getPlansForCommunity: vi.fn().mockImplementation(async (commId: string) => {
        if (commId === 'com_1') return [validFreePlan, validPaidPlan, inactivePlan];
        return [];
      }),
      getMembership: vi.fn().mockResolvedValue(null),
      createMembership: vi.fn().mockResolvedValue(undefined),
      initializeProgress: vi.fn().mockResolvedValue(undefined),
      getRoadmapItemIds: vi.fn().mockResolvedValue(['step_1', 'step_2', 'step_3']),
    };

    mockQueryRepo = {
      getMemberCommunityView: vi.fn().mockResolvedValue(null),
    };

    mockPaymentService = {
      processPayment: vi.fn().mockResolvedValue({ success: true, transactionId: 'txn_123' }),
    };

    service = new MembershipService(mockRepo, mockQueryRepo, mockPaymentService);
  });

  // ==========================================
  // READ MODEL & QUERY TESTS
  // ==========================================
  describe('Queries', () => {
    it('should return null if user is not a member', async () => {
      const membership = await service.getMembership('u_visitor', 'com_1');
      expect(membership).toBeNull();

      const view = await service.getMemberCommunityView('u_visitor', 'com_1');
      expect(view).toBeNull();
    });

    it('should return active membership view when member exists', async () => {
      const mockView: MemberCommunityReadModel = {
        communityId: 'com_1',
        name: 'TypeScript Mastery',
        categoryName: 'Tech',
        activeToday: 15,
        membershipStatus: 'active',
        memberRole: 'member',
        joinedAt: new Date(),
        roadmap: [],
        totalItems: 3,
        completedItems: 1,
      };

      vi.mocked(mockQueryRepo.getMemberCommunityView).mockResolvedValue(mockView);

      const view = await service.getMemberCommunityView('u_member', 'com_1');
      expect(view).toEqual(mockView);
      expect(view?.membershipStatus).toBe('active');
    });
  });

  // ==========================================
  // 1. COMMUNITY VALIDATION
  // ==========================================
  describe('1. Community Validation', () => {
    it('1. nonexistent community rejected', async () => {
      await expect(
        service.joinCommunity('u_user1', 'nonexistent_community', 'plan_free')
      ).rejects.toThrow('Community with ID "nonexistent_community" does not exist.');

      expect(mockRepo.createMembership).not.toHaveBeenCalled();
      expect(mockRepo.initializeProgress).not.toHaveBeenCalled();
      expect(mockPaymentService.processPayment).not.toHaveBeenCalled();
    });
  });

  // ==========================================
  // 2. PLAN VALIDATION
  // ==========================================
  describe('2. Plan Validation', () => {
    it('2. nonexistent plan rejected', async () => {
      await expect(
        service.joinCommunity('u_user1', 'com_1', 'nonexistent_plan')
      ).rejects.toThrow('Membership plan with ID "nonexistent_plan" does not exist.');

      expect(mockRepo.createMembership).not.toHaveBeenCalled();
      expect(mockRepo.initializeProgress).not.toHaveBeenCalled();
    });

    it('3. plan from another community rejected', async () => {
      await expect(
        service.joinCommunity('u_user1', 'com_1', 'plan_other')
      ).rejects.toThrow('Plan "plan_other" does not belong to community "com_1".');

      expect(mockRepo.createMembership).not.toHaveBeenCalled();
      expect(mockRepo.initializeProgress).not.toHaveBeenCalled();
    });

    it('4. unavailable plan rejected', async () => {
      await expect(
        service.joinCommunity('u_user1', 'com_1', 'plan_inactive')
      ).rejects.toThrow('Plan "plan_inactive" is currently unavailable for joining.');

      expect(mockRepo.createMembership).not.toHaveBeenCalled();
      expect(mockRepo.initializeProgress).not.toHaveBeenCalled();
    });
  });

  // ==========================================
  // 3. FREE MEMBERSHIP
  // ==========================================
  describe('3. Free Membership', () => {
    it('5. valid free join creates membership', async () => {
      await service.joinCommunity('u_user1', 'com_1', 'plan_free');

      expect(mockRepo.createMembership).toHaveBeenCalledTimes(1);
      const created = vi.mocked(mockRepo.createMembership).mock.calls[0][0];
      expect(created.userId).toBe('u_user1');
      expect(created.communityId).toBe('com_1');
      expect(created.planId).toBe('plan_free');
      expect(created.status).toBe('active');
    });

    it('6. free join does not call payment', async () => {
      await service.joinCommunity('u_user1', 'com_1', 'plan_free');

      expect(mockPaymentService.processPayment).not.toHaveBeenCalled();
    });

    it('resolves free plan automatically if no planId provided', async () => {
      await service.joinCommunity('u_user1', 'com_1');

      expect(mockRepo.createMembership).toHaveBeenCalledTimes(1);
      const created = vi.mocked(mockRepo.createMembership).mock.calls[0][0];
      expect(created.planId).toBe('plan_free');
      expect(mockPaymentService.processPayment).not.toHaveBeenCalled();
    });
  });

  // ==========================================
  // 4. PAID MEMBERSHIP & AUTHORITATIVE PRICING
  // ==========================================
  describe('4. Paid Membership', () => {
    it('7. valid paid join calls payment', async () => {
      await service.joinCommunity('u_user1', 'com_1', 'plan_paid');

      expect(mockPaymentService.processPayment).toHaveBeenCalledTimes(1);
    });

    it('8. authoritative plan price is used', async () => {
      await service.joinCommunity('u_user1', 'com_1', 'plan_paid');

      const paymentCall = vi.mocked(mockPaymentService.processPayment).mock.calls[0][0];
      expect(paymentCall.amount).toBe(1500);
    });

    it('9. authoritative currency is used', async () => {
      await service.joinCommunity('u_user1', 'com_1', 'plan_paid');

      const paymentCall = vi.mocked(mockPaymentService.processPayment).mock.calls[0][0];
      expect(paymentCall.currency).toBe('USD');
    });

    it('10. successful payment creates membership', async () => {
      await service.joinCommunity('u_user1', 'com_1', 'plan_paid');

      expect(mockRepo.createMembership).toHaveBeenCalledTimes(1);
      const created = vi.mocked(mockRepo.createMembership).mock.calls[0][0];
      expect(created.status).toBe('active');
      expect(created.planId).toBe('plan_paid');
    });

    it('11. successful payment initializes progress', async () => {
      await service.joinCommunity('u_user1', 'com_1', 'plan_paid');

      expect(mockRepo.initializeProgress).toHaveBeenCalledTimes(1);
      const progress = vi.mocked(mockRepo.initializeProgress).mock.calls[0][0];
      expect(progress).toHaveLength(3);
    });
  });

  // ==========================================
  // 5. PAYMENT FAILURE
  // ==========================================
  describe('5. Payment Failure', () => {
    beforeEach(() => {
      vi.mocked(mockPaymentService.processPayment).mockResolvedValue({
        success: false,
        error: 'Card declined: Insufficient funds.',
      });
    });

    it('12. failed payment creates no membership', async () => {
      await expect(
        service.joinCommunity('u_user1', 'com_1', 'plan_paid')
      ).rejects.toThrow('Card declined: Insufficient funds.');

      expect(mockRepo.createMembership).not.toHaveBeenCalled();
    });

    it('13. failed payment creates no progress', async () => {
      await expect(
        service.joinCommunity('u_user1', 'com_1', 'plan_paid')
      ).rejects.toThrow('Card declined: Insufficient funds.');

      expect(mockRepo.initializeProgress).not.toHaveBeenCalled();
    });
  });

  // ==========================================
  // 6. DUPLICATE MEMBERSHIP
  // ==========================================
  describe('6. Duplicate Membership', () => {
    it('14. duplicate active membership rejected/prevented', async () => {
      const activeMembership: Membership = {
        id: 'mem_existing',
        userId: 'u_user1',
        communityId: 'com_1',
        planId: 'plan_paid',
        role: 'member',
        joinedAt: new Date(),
        status: 'active',
      };

      vi.mocked(mockRepo.getMembership).mockResolvedValue(activeMembership);

      await expect(
        service.joinCommunity('u_user1', 'com_1', 'plan_paid')
      ).rejects.toThrow('User is already an active member of this community.');

      expect(mockPaymentService.processPayment).not.toHaveBeenCalled();
      expect(mockRepo.createMembership).not.toHaveBeenCalled();
      expect(mockRepo.initializeProgress).not.toHaveBeenCalled();
    });
  });

  // ==========================================
  // 7. PROGRESS INITIALIZATION
  // ==========================================
  describe('7. Progress Initialization', () => {
    it('15. first roadmap item is current', async () => {
      await service.joinCommunity('u_user1', 'com_1', 'plan_free');

      const progress = vi.mocked(mockRepo.initializeProgress).mock.calls[0][0];
      expect(progress[0].roadmapItemId).toBe('step_1');
      expect(progress[0].status).toBe('current');
    });

    it('16. remaining roadmap items are locked', async () => {
      await service.joinCommunity('u_user1', 'com_1', 'plan_free');

      const progress = vi.mocked(mockRepo.initializeProgress).mock.calls[0][0];
      expect(progress[1].roadmapItemId).toBe('step_2');
      expect(progress[1].status).toBe('locked');
      expect(progress[2].roadmapItemId).toBe('step_3');
      expect(progress[2].status).toBe('locked');
    });

    it('17. progress is initialized exactly once', async () => {
      await service.joinCommunity('u_user1', 'com_1', 'plan_free');

      expect(mockRepo.initializeProgress).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================
  // 8. AUTHORIZATION & USER OWNERSHIP
  // ==========================================
  describe('8. Authorization & User Ownership', () => {
    it('18. unauthenticated join rejected', async () => {
      await expect(
        service.joinCommunity('', 'com_1', 'plan_free')
      ).rejects.toThrow('Authentication required to join a community.');

      await expect(
        service.joinCommunity('   ', 'com_1', 'plan_free')
      ).rejects.toThrow('Authentication required to join a community.');

      expect(mockRepo.createMembership).not.toHaveBeenCalled();
    });

    it('19. membership belongs to the current user', async () => {
      const specificUserId = 'u_special_auth_user_99';
      await service.joinCommunity(specificUserId, 'com_1', 'plan_free');

      const created = vi.mocked(mockRepo.createMembership).mock.calls[0][0];
      expect(created.userId).toBe(specificUserId);

      const progress = vi.mocked(mockRepo.initializeProgress).mock.calls[0][0];
      progress.forEach(p => {
        expect(p.userId).toBe(specificUserId);
      });
    });
  });
});

