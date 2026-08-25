import { Membership } from '../domain/membership';
import { LearningProgress } from '../domain/progress';

export interface IMembershipRepository {
  getMembership(userId: string, communityId: string): Promise<Membership | null>;
  createMembership(membership: Membership): Promise<void>;
  initializeProgress(progressItems: LearningProgress[]): Promise<void>;
  getRoadmapItemIds(communityId: string): Promise<string[]>;
}
