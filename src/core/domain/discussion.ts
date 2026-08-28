export type DiscussionType =
  | 'discussion'
  | 'question'
  | 'answer'
  | 'announcement'
  | 'learning_milestone'
  | 'resource'
  | 'project'
  | 'social_chatter'
  | 'introduction';

export type SignalQuality = 'high_signal' | 'normal' | 'low_signal';

export type ConsensusStatus =
  | 'resolved'
  | 'differing_perspectives'
  | 'unanswered'
  | 'open'
  | 'informational';

export type ReplyStance = 'supporting' | 'opposing' | 'alternative' | 'neutral';

export interface SourceProvenance {
  provider: string;
  externalCommunityId: string;
  externalMessageId: string;
  externalParentMessageId?: string;
  externalThreadId?: string;
  externalAuthorId?: string;
  originalTimestamp: Date;
  ingestedAt: Date;
  isEdited?: boolean;
  editedAt?: Date;
  isDeleted?: boolean;
  deletedAt?: Date;
  isForwarded?: boolean;
  forwardedFrom?: string;
  hasMissingParent?: boolean;
  rawEventIds?: string[];
  mergedExternalMessageIds?: string[];
}

export interface DiscussionAuthor {
  id: string;
  name: string;
  avatarUrl: string;
  role: 'creator' | 'member' | 'mentor';
}

export interface DiscussionResource {
  id: string;
  title: string;
  url: string;
  type: 'link' | 'github' | 'paper' | 'guide';
  sourceDiscussionId?: string;
  sourceRoadmapItemId?: string;
  attributedBy?: string;
}

export interface DiscussionReply {
  id: string;
  author: DiscussionAuthor;
  content: string;
  createdAt: Date;
  isAnswer?: boolean;
  stance?: ReplyStance;
  isDeleted?: boolean;
  sourceProvenance?: SourceProvenance;
}

export interface Discussion {
  id: string;
  communityId: string;
  roadmapItemId: string;
  topicTitle: string;
  author: DiscussionAuthor;
  title: string;
  content: string;
  type: DiscussionType;
  signalQuality?: SignalQuality;
  consensusStatus?: ConsensusStatus;
  createdAt: Date;
  isResolved?: boolean;
  resolutionSummary?: string;
  resolvedBy?: string;
  perspectiveSummary?: string;
  isDeleted?: boolean;
  sourceProvenance?: SourceProvenance;
  resources?: DiscussionResource[];
  replies: DiscussionReply[];
  replyCount: number;
}
