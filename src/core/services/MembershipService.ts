import { IMembershipService } from './IMembershipService';
import { IMembershipRepository } from '../repositories/IMembershipRepository';
import { IMembershipQueryRepository } from '../repositories/IMembershipQueryRepository';
import { Membership } from '../domain/membership';
import { MemberCommunityReadModel } from '../readmodels/MemberCommunityReadModel';

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
}
