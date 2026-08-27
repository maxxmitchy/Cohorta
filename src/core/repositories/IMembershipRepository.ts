import { Membership, MembershipPlan } from '../domain/membership';
import { LearningProgress } from '../domain/progress';
import { Community } from '../domain/community';

export interface IMembershipRepository {
  getCommunity(communityId: string): Promise<Community | null>;
  getPlan(planId: string): Promise<MembershipPlan | null>;
  getPlansForCommunity(communityId: string): Promise<MembershipPlan[]>;
  getMembership(userId: string, communityId: string): Promise<Membership | null>;
  createMembership(membership: Membership): Promise<void>;
  initializeProgress(progressItems: LearningProgress[]): Promise<void>;
  getRoadmapItemIds(communityId: string): Promise<string[]>;
}

