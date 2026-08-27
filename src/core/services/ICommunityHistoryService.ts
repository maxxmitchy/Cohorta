import { CommunityHistoryReadModel } from '../readmodels/CommunityHistoryReadModel';
import { Discussion } from '../domain/discussion';

export interface ICommunityHistoryService {
  getCommunityHistory(userId: string, communityId: string): Promise<CommunityHistoryReadModel>;
  getDiscussion(userId: string, communityId: string, discussionId: string): Promise<Discussion>;
}
