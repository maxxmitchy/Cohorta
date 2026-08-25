import { IMembershipService } from './IMembershipService';
import { IMembershipRepository } from '../repositories/IMembershipRepository';
import { IMembershipQueryRepository } from '../repositories/IMembershipQueryRepository';
import { Membership } from '../domain/membership';
import { MemberCommunityReadModel } from '../readmodels/MemberCommunityReadModel';
import { LearningProgress } from '../domain/progress';

export class MembershipService implements IMembershipService {
  constructor(
    private readonly repo: IMembershipRepository,
    private readonly queryRepo: IMembershipQueryRepository
  ) {}

  async getMembership(userId: string, communityId: string): Promise<Membership | null> {
    return this.repo.getMembership(userId, communityId);
  }

  async getMemberCommunityView(userId: string, communityId: string): Promise<MemberCommunityReadModel | null> {
    return this.queryRepo.getMemberCommunityView(userId, communityId);
  }

  async joinCommunity(userId: string, communityId: string, planId?: string): Promise<void> {
    // 1. Prevent duplicate active memberships
    const existing = await this.repo.getMembership(userId, communityId);
    if (existing && existing.status === 'active') {
      throw new Error('User is already an active member of this community.');
    }

    // 2. Create the membership
    const membership: Membership = {
      id: `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      communityId,
      planId: planId || 'free',
      role: 'member',
      joinedAt: new Date(),
      status: 'active'
    };
    await this.repo.createMembership(membership);

    // 3. Initialize learning progress
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
