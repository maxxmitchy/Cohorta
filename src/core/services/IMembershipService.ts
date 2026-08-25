import { MemberCommunityReadModel } from '../readmodels/MemberCommunityReadModel';
import { Membership } from '../domain/membership';

export interface IMembershipService {
  /**
   * Check if a specific user is an active member of a community.
   */
  getMembership(userId: string, communityId: string): Promise<Membership | null>;

  /**
   * Get the personalized Member view of a community.
   */
  getMemberCommunityView(userId: string, communityId: string): Promise<MemberCommunityReadModel | null>;
  
  /**
   * Joins a community. Validates duplicate memberships and initializes progress.
   */
  joinCommunity(userId: string, communityId: string, planId?: string): Promise<void>;
}
