import { MemberCommunityReadModel } from '../readmodels/MemberCommunityReadModel';

export interface IMembershipQueryRepository {
  getMemberCommunityView(userId: string, communityId: string): Promise<MemberCommunityReadModel | null>;
}
