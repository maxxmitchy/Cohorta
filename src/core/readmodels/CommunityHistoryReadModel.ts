import { Discussion, DiscussionResource } from '../domain/discussion';
import { RoadmapItemStatus } from '../domain/learning';

export interface HistoricalTimelineTopic {
  roadmapItemId: string;
  orderIndex: number;
  title: string;
  description: string;
  status: RoadmapItemStatus;
  startedAt?: Date;
  completedAt?: Date;
  keyIdea?: string;
  summary?: string;
  discussionCount: number;
  discussions: Discussion[];
  keyResources: DiscussionResource[];
}

export interface CommunityPulse {
  currentTopic: string;
  activeToday: number;
  activeDiscussionsCount: number;
  latestMilestone: string;
  latestResource?: DiscussionResource;
  featuredDiscussion?: Discussion;
}

export interface CommunityHistoryReadModel {
  communityId: string;
  communityName: string;
  categoryName: string;
  currentTopic: string;
  timeline: HistoricalTimelineTopic[];
  pulse: CommunityPulse;
  totalDiscussions: number;
  totalResources: number;
}
