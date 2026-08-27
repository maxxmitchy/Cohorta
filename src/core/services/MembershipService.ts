import { IMembershipService } from './IMembershipService';
import { IMembershipRepository } from '../repositories/IMembershipRepository';
import { IMembershipQueryRepository } from '../repositories/IMembershipQueryRepository';
import { IPaymentService } from './IPaymentService';
import { Membership, MembershipPlan } from '../domain/membership';
import { MemberCommunityReadModel } from '../readmodels/MemberCommunityReadModel';
import { LearningProgress } from '../domain/progress';

export class MembershipService implements IMembershipService {
  constructor(
    private readonly repo: IMembershipRepository,
    private readonly queryRepo: IMembershipQueryRepository,
    private readonly paymentService: IPaymentService
  ) {}

  async getMembership(userId: string, communityId: string): Promise<Membership | null> {
    return this.repo.getMembership(userId, communityId);
  }

  async getMemberCommunityView(userId: string, communityId: string): Promise<MemberCommunityReadModel | null> {
    return this.queryRepo.getMemberCommunityView(userId, communityId);
  }

  async joinCommunity(userId: string, communityId: string, planId?: string): Promise<void> {
    // 1. Authentication check
    if (!userId || userId.trim() === '') {
      throw new Error('Authentication required to join a community.');
    }

    // 2. Community existence validation
    const community = await this.repo.getCommunity(communityId);
    if (!community) {
      throw new Error(`Community with ID "${communityId}" does not exist.`);
    }

    // 3. Plan resolution and validation
    let plan: MembershipPlan | null = null;
    if (planId) {
      plan = await this.repo.getPlan(planId);
      if (!plan) {
        throw new Error(`Membership plan with ID "${planId}" does not exist.`);
      }
      if (plan.communityId !== communityId) {
        throw new Error(`Plan "${planId}" does not belong to community "${communityId}".`);
      }
      if (!plan.isActive) {
        throw new Error(`Plan "${planId}" is currently unavailable for joining.`);
      }
    } else {
      // Default to the community's active free plan if no plan is specified
      const plans = await this.repo.getPlansForCommunity(communityId);
      const freePlan = plans.find(p => p.type === 'free' && p.isActive);
      if (!freePlan) {
        throw new Error('No free plan available for this community. A valid plan ID must be provided.');
      }
      plan = freePlan;
    }

    // 4. Duplicate active membership check
    const existing = await this.repo.getMembership(userId, communityId);
    if (existing && existing.status === 'active') {
      throw new Error('User is already an active member of this community.');
    }

    // 5. Payment processing for paid plans (authoritative price and currency from the validated plan)
    if (plan.type !== 'free' || plan.priceAmount > 0) {
      const paymentResult = await this.paymentService.processPayment({
        userId,
        planId: plan.id,
        amount: plan.priceAmount,
        currency: plan.priceCurrency,
      });

      if (!paymentResult.success) {
        throw new Error(paymentResult.error || 'Payment failed. Membership was not created.');
      }
    }

    // 6. Create the active membership (atomically executed after payment success)
    const membership: Membership = {
      id: `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      communityId,
      planId: plan.id,
      role: 'member',
      joinedAt: new Date(),
      status: 'active'
    };
    await this.repo.createMembership(membership);

    // 7. Initialize learning progress
    const roadmapItemIds = await this.repo.getRoadmapItemIds(communityId);
    if (roadmapItemIds.length > 0) {
      const progressItems: LearningProgress[] = roadmapItemIds.map((itemId, index) => ({
        userId,
        communityId,
        roadmapItemId: itemId,
        status: index === 0 ? 'current' : 'locked',
        updatedAt: new Date(),
      }));
      await this.repo.initializeProgress(progressItems);
    }
  }
}

