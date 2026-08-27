export type DiscussionType =
  | 'discussion'
  | 'question'
  | 'answer'
  | 'announcement'
  | 'learning_milestone'
  | 'resource'
  | 'project'
  | 'introduction';

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
}

export interface DiscussionReply {
  id: string;
  author: DiscussionAuthor;
  content: string;
  createdAt: Date;
  isAnswer?: boolean;
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
  createdAt: Date;
  isResolved?: boolean;
  resolutionSummary?: string;
  resources?: DiscussionResource[];
  replies: DiscussionReply[];
  replyCount: number;
}
