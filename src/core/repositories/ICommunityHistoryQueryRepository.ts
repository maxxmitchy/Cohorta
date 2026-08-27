import { CommunityHistoryReadModel } from '../readmodels/CommunityHistoryReadModel';
import { Discussion } from '../domain/discussion';
import { HistoricalTopicEvent } from '../domain/history';

export interface ICommunityHistoryQueryRepository {
  getCommunityHistory(communityId: string): Promise<CommunityHistoryReadModel | null>;
  getDiscussionsForTopic(communityId: string, roadmapItemId: string): Promise<Discussion[]>;
  getDiscussionById(communityId: string, discussionId: string): Promise<Discussion | null>;
  getHistoricalTopics(communityId: string): Promise<HistoricalTopicEvent[]>;
}
