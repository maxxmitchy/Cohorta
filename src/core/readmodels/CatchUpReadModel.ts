import { Discussion, DiscussionResource } from '../domain/discussion';

export interface MissedTopicInsight {
  roadmapItemId: string;
  orderIndex: number;
  title: string;
  completedAt?: Date;
  keyIdea: string;
  summary: string;
  discussionCount: number;
  notableDiscussions: Discussion[];
  topResources: DiscussionResource[];
}

export interface CatchUpReadModel {
  memberId: string;
  communityId: string;
  communityName: string;
  categoryName: string;
  joinedAt: Date;
  currentTopic: string;
  hasMissedContent: boolean;
  missedTopicsCount: number;
  missedTopics: MissedTopicInsight[];
  summaryHeadline: string;
  summaryNarrative: string;
  recommendedStartingPoint: {
    roadmapItemId: string;
    title: string;
    reason: string;
  };
  currentFocusContext: {
    title: string;
    description: string;
    whyItMattersNow: string;
  };
}
