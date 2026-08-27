/**
 * Provider-Agnostic Raw Community Source Event Model.
 *
 * Represents raw, unnormalized, semi-structured events emitted by external community
 * messaging platforms (chat streams, forums, channels) prior to normalization into Cohorta's domain.
 *
 * Hard Architectural Invariant:
 * - This layer MUST remain strictly provider-neutral.
 * - No vendor-specific SDK types, credentials, or proprietary headers.
 */

export type SourceEventType =
  | 'message_created'
  | 'message_edited'
  | 'message_deleted'
  | 'reply_created'
  | 'resource_shared'
  | 'member_joined'
  | 'member_left'
  | 'thread_created';

export interface ExternalAuthorRef {
  externalUserId: string;
  displayName: string;
  avatarUrl?: string;
  roleHint?: 'creator' | 'member' | 'mentor';
}

export interface ExternalResourceRef {
  url: string;
  title?: string;
  type?: 'link' | 'github' | 'paper' | 'guide';
}

export interface ExternalCommunitySourceEvent {
  /** The provider identifier (e.g. 'generic_chat', 'chat_provider_a', 'mock_stream') */
  provider: string;
  /** Unique event identifier from the external provider stream */
  externalEventId: string;
  /** Community / Channel / Group identifier in the external provider */
  externalCommunityId: string;
  /** Message / Post identifier in the external provider */
  externalMessageId: string;
  /** Parent message identifier if this event is a reply to an existing message */
  externalParentMessageId?: string;
  /** Thread or topic bucket identifier in the external provider */
  externalThreadId?: string;
  /** Type of community stream event */
  eventType: SourceEventType;
  /** Author details as provided by the external platform */
  author?: ExternalAuthorRef;
  /** Raw textual content */
  content?: string;
  /** External UTC creation/occurrence timestamp */
  timestamp: Date;
  /** Sequence number if provided by the stream for sub-millisecond tie-breaking */
  sequenceId?: number;
  /** Optional mapped or hinted Cohorta roadmap item ID */
  roadmapItemId?: string;
  /** Optional human-readable topic title or channel name hint */
  topicHint?: string;
  /** Explicit resource references if attached by the platform */
  resources?: ExternalResourceRef[];
  /** Semi-structured metadata for platform-specific hints */
  metadata?: {
    isForwarded?: boolean;
    forwardedFrom?: string;
    stanceHint?: 'supporting' | 'opposing' | 'alternative' | 'neutral';
    isAnswerHint?: boolean;
    isResolvedHint?: boolean;
    resolutionSummaryHint?: string;
    editedAt?: Date;
    deletedAt?: Date;
    [key: string]: unknown;
  };
}
