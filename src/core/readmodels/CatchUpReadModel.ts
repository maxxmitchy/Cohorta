import { Discussion, DiscussionResource } from '../domain/discussion';

export type ConsensusLevel =
  | 'strong_consensus'
  | 'differing_perspectives'
  | 'unresolved_inquiry'
  | 'informational'
  | 'insufficient_data';

export type EvidenceStatus =
  | 'grounded'
  | 'limited_history'
  | 'no_history_needed'
  | 'empty_history';

export interface MissedTopicInsight {
  roadmapItemId: string;
  orderIndex: number;
  title: string;
  completedAt?: Date;
  keyIdea: string;
  summary: string;
  consensusLevel: ConsensusLevel;
  discussionCount: number;
  highSignalDiscussionCount: number;
  notableDiscussions: Discussion[];
  openQuestions: Array<{
    id: string;
    title: string;
    authorName: string;
    discussionId?: string;
  }>;
  divergentTopics: Array<{
    title: string;
    summary: string;
    perspectives: string[];
    sourceDiscussionId?: string;
    sourceReplyIds?: string[];
  }>;
  topResources: DiscussionResource[];
  sourceDiscussionIds: string[];
  sourceReplyIds: string[];
  sourceResourceIds: string[];
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
  evidenceStatus: EvidenceStatus;
  missedTopics: MissedTopicInsight[];
  summaryHeadline: string;
  summaryNarrative: string;
  recommendedStartingPoint: {
    roadmapItemId: string;
    title: string;
    reason: string;
    confidence: 'high' | 'moderate' | 'tentative';
  };
  currentFocusContext: {
    title: string;
    description: string;
    whyItMattersNow: string;
    hasActiveDiscussions: boolean;
  };
}
