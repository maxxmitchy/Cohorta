import {
  Discussion,
  DiscussionAuthor,
  DiscussionReply,
  DiscussionResource,
  DiscussionType,
  SignalQuality,
  ConsensusStatus,
  ReplyStance,
  SourceProvenance,
} from '../domain/discussion';
import { ExternalCommunitySourceEvent, ExternalAuthorRef, ExternalResourceRef } from './ExternalCommunitySourceEvent';

export interface NormalizerOptions {
  /** Maximum elapsed time (ms) between consecutive messages from the same author to group them into a single discussion */
  multiMessageWindowMs?: number;
  /** Custom mapping from externalCommunityId to internal Cohorta communityId */
  communityIdMapper?: (externalCommunityId: string) => string;
  /** Default fallback roadmapItemId if none was provided in source event */
  defaultRoadmapItemId?: string;
  /** Ingestion timestamp recorded for provenance (defaults to new Date()) */
  ingestedAt?: Date;
}

interface WorkingMessage {
  provider: string;
  externalCommunityId: string;
  externalMessageId: string;
  externalParentMessageId?: string;
  externalThreadId?: string;
  author: DiscussionAuthor;
  title: string;
  content: string;
  originalContent: string;
  createdAt: Date;
  sequenceId: number;
  roadmapItemId: string;
  topicTitle: string;
  type: DiscussionType;
  signalQuality: SignalQuality;
  consensusStatus?: ConsensusStatus;
  isResolved?: boolean;
  resolutionSummary?: string;
  resolvedBy?: string;
  perspectiveSummary?: string;
  isEdited?: boolean;
  editedAt?: Date;
  isDeleted?: boolean;
  deletedAt?: Date;
  isForwarded?: boolean;
  forwardedFrom?: string;
  hasMissingParent?: boolean;
  resources: DiscussionResource[];
  replies: DiscussionReply[];
  rawEventIds: string[];
  isAnswer?: boolean;
  stance?: ReplyStance;
}

const NOISE_PATTERNS = [
  /^(good morning|gm|hello|hi|hey|anyone here\??|thanks|thank you|thx|nice|great|following|following this|\+1|👍|🔥|🚀|🙏|cool|bump)(\s+(everyone|all|guys|folks|there|team))?[\s!🔥👍🚀🙏❤️💯👏]*$/i,
  /^[\s!🔥👍🚀🙏❤️💯👏]+$/,
];

/**
 * Provider-agnostic normalizer that converts messy, out-of-order, duplicated,
 * edited, or deleted external community source events into clean, structurally sound
 * Cohorta domain entities.
 */
export class CommunityHistoryNormalizer {
  /**
   * Normalizes an array of raw source events into an array of Discussion domain entities.
   */
  static normalize(
    events: ExternalCommunitySourceEvent[],
    options: NormalizerOptions = {}
  ): Discussion[] {
    const multiMessageWindowMs = options.multiMessageWindowMs ?? 5 * 60 * 1000; // 5 minutes
    const communityIdMapper = options.communityIdMapper ?? ((id: string) => id);
    const defaultRoadmapItemId = options.defaultRoadmapItemId ?? 'general';
    const ingestedAt = options.ingestedAt ?? new Date();

    // 1. Deduplicate events at the ingestion boundary
    const seenEventKeys = new Set<string>();
    const uniqueEvents: ExternalCommunitySourceEvent[] = [];

    for (const ev of events) {
      const eventKey = `${ev.provider}:${ev.externalCommunityId}:${ev.externalEventId}`;
      const payloadKey = `${ev.provider}:${ev.externalCommunityId}:${ev.externalMessageId}:${ev.eventType}:${ev.timestamp.getTime()}`;

      if (seenEventKeys.has(eventKey) || seenEventKeys.has(payloadKey)) {
        continue;
      }
      seenEventKeys.add(eventKey);
      seenEventKeys.add(payloadKey);
      uniqueEvents.push(ev);
    }

    // 2. Establish strict chronological & sequential ordering
    uniqueEvents.sort((a, b) => {
      const timeDiff = a.timestamp.getTime() - b.timestamp.getTime();
      if (timeDiff !== 0) return timeDiff;
      const seqA = a.sequenceId ?? 0;
      const seqB = b.sequenceId ?? 0;
      if (seqA !== seqB) return seqA - seqB;
      return a.externalEventId.localeCompare(b.externalEventId);
    });

    // 3. Process message lifecycle events per community message
    const messageRegistry = new Map<string, WorkingMessage>();
    const tombstones = new Set<string>();

    for (const ev of uniqueEvents) {
      const msgKey = `${ev.provider}:${ev.externalCommunityId}:${ev.externalMessageId}`;

      // Handle message deletion
      if (ev.eventType === 'message_deleted') {
        tombstones.add(msgKey);
        const existing = messageRegistry.get(msgKey);
        if (existing) {
          existing.isDeleted = true;
          existing.deletedAt = ev.timestamp;
          existing.resources = [];
          existing.rawEventIds.push(ev.externalEventId);
        }
        continue;
      }

      // Handle message edit
      if (ev.eventType === 'message_edited') {
        const existing = messageRegistry.get(msgKey);
        const newContent = ev.content ?? '';
        const newResources = this.extractResources(
          ev.provider,
          ev.externalMessageId,
          newContent,
          ev.resources,
          ev.author?.displayName
        );

        if (existing) {
          existing.content = newContent;
          existing.isEdited = true;
          existing.editedAt = ev.timestamp;
          existing.resources = newResources;
          existing.rawEventIds.push(ev.externalEventId);
          // Re-evaluate signal and classification based on edited content
          const classification = this.classifyContent(newContent, ev.eventType);
          existing.type = classification.type;
          existing.signalQuality = classification.signalQuality;
        } else {
          // Edit arrived without prior create (e.g. truncated history)
          const author = this.normalizeAuthor(ev.author);
          const classification = this.classifyContent(newContent, ev.eventType);
          messageRegistry.set(msgKey, {
            provider: ev.provider,
            externalCommunityId: ev.externalCommunityId,
            externalMessageId: ev.externalMessageId,
            externalParentMessageId: ev.externalParentMessageId,
            externalThreadId: ev.externalThreadId,
            author,
            title: this.deriveTitle(newContent, ev.topicHint),
            content: newContent,
            originalContent: newContent,
            createdAt: ev.timestamp,
            sequenceId: ev.sequenceId ?? 0,
            roadmapItemId: ev.roadmapItemId ?? defaultRoadmapItemId,
            topicTitle: ev.topicHint ?? 'General',
            type: classification.type,
            signalQuality: classification.signalQuality,
            isEdited: true,
            editedAt: ev.timestamp,
            isDeleted: tombstones.has(msgKey),
            isForwarded: ev.metadata?.isForwarded,
            forwardedFrom: ev.metadata?.forwardedFrom,
            resources: newResources,
            replies: [],
            rawEventIds: [ev.externalEventId],
            isAnswer: ev.metadata?.isAnswerHint,
            stance: ev.metadata?.stanceHint,
            isResolved: ev.metadata?.isResolvedHint,
            resolutionSummary: ev.metadata?.resolutionSummaryHint,
          });
        }
        continue;
      }

      // Handle message / reply / thread creation
      const isDeleted = tombstones.has(msgKey);
      const rawContent = ev.content ?? '';
      const author = this.normalizeAuthor(ev.author);
      const classification = this.classifyContent(rawContent, ev.eventType);
      const resources = this.extractResources(
        ev.provider,
        ev.externalMessageId,
        rawContent,
        ev.resources,
        author.name
      );

      const working: WorkingMessage = {
        provider: ev.provider,
        externalCommunityId: ev.externalCommunityId,
        externalMessageId: ev.externalMessageId,
        externalParentMessageId: ev.externalParentMessageId,
        externalThreadId: ev.externalThreadId,
        author,
        title: this.deriveTitle(rawContent, ev.topicHint),
        content: rawContent,
        originalContent: rawContent,
        createdAt: ev.timestamp,
        sequenceId: ev.sequenceId ?? 0,
        roadmapItemId: ev.roadmapItemId ?? defaultRoadmapItemId,
        topicTitle: ev.topicHint ?? 'General',
        type: classification.type,
        signalQuality: classification.signalQuality,
        consensusStatus: ev.metadata?.isResolvedHint ? 'resolved' : (ev.metadata?.stanceHint ? 'differing_perspectives' : undefined),
        isResolved: ev.metadata?.isResolvedHint,
        resolutionSummary: ev.metadata?.resolutionSummaryHint,
        isDeleted,
        isForwarded: ev.metadata?.isForwarded,
        forwardedFrom: ev.metadata?.forwardedFrom,
        resources,
        replies: [],
        rawEventIds: [ev.externalEventId],
        isAnswer: ev.metadata?.isAnswerHint,
        stance: ev.metadata?.stanceHint,
      };

      messageRegistry.set(msgKey, working);
    }

    // 4. Multi-message consecutive grouping and reply hierarchy reconstruction
    // Group messages by community
    const communityMessagesMap = new Map<string, WorkingMessage[]>();
    for (const msg of messageRegistry.values()) {
      const commKey = `${msg.provider}:${msg.externalCommunityId}`;
      const list = communityMessagesMap.get(commKey) || [];
      list.push(msg);
      communityMessagesMap.set(commKey, list);
    }

    const normalizedDiscussions: Discussion[] = [];

    for (const [commKey, messages] of communityMessagesMap.entries()) {
      // Sort messages within community chronologically
      messages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.sequenceId - b.sequenceId);

      const rootDiscussions: WorkingMessage[] = [];
      const repliesToAttach: WorkingMessage[] = [];

      for (const msg of messages) {
        if (msg.externalParentMessageId) {
          repliesToAttach.push(msg);
        } else {
          // Check for multi-message consecutive grouping:
          // If previous root discussion was from same author, same topic, within window, and has no replies yet
          const lastRoot = rootDiscussions[rootDiscussions.length - 1];
          if (
            lastRoot &&
            lastRoot.author.id === msg.author.id &&
            lastRoot.roadmapItemId === msg.roadmapItemId &&
            !lastRoot.isDeleted &&
            !msg.isDeleted &&
            msg.createdAt.getTime() - lastRoot.createdAt.getTime() <= multiMessageWindowMs &&
            lastRoot.replies.length === 0
          ) {
            // Merge consecutive message into prior root
            lastRoot.content = `${lastRoot.content}\n\n${msg.content}`;
            lastRoot.resources.push(...msg.resources);
            lastRoot.rawEventIds.push(...msg.rawEventIds);
            // Re-derive title if prior was brief
            if (lastRoot.title.length < 20) {
              lastRoot.title = this.deriveTitle(lastRoot.content, lastRoot.topicTitle);
            }
          } else {
            rootDiscussions.push(msg);
          }
        }
      }

      // Reconstruct reply hierarchy
      for (const replyMsg of repliesToAttach) {
        const parentKey = `${replyMsg.provider}:${replyMsg.externalCommunityId}:${replyMsg.externalParentMessageId}`;
        const parent = messageRegistry.get(parentKey);

        if (parent) {
          // Attached to parent discussion
          const domainReply: DiscussionReply = {
            id: `rep_${replyMsg.provider}_${replyMsg.externalMessageId}`,
            author: replyMsg.author,
            content: replyMsg.content,
            createdAt: replyMsg.createdAt,
            isAnswer: replyMsg.isAnswer,
            stance: replyMsg.stance ?? 'neutral',
            isDeleted: replyMsg.isDeleted,
            sourceProvenance: {
              provider: replyMsg.provider,
              externalCommunityId: replyMsg.externalCommunityId,
              externalMessageId: replyMsg.externalMessageId,
              externalParentMessageId: replyMsg.externalParentMessageId,
              externalThreadId: replyMsg.externalThreadId,
              externalAuthorId: replyMsg.author.id,
              originalTimestamp: replyMsg.createdAt,
              ingestedAt,
              isEdited: replyMsg.isEdited,
              editedAt: replyMsg.editedAt,
              isDeleted: replyMsg.isDeleted,
              deletedAt: replyMsg.deletedAt,
              isForwarded: replyMsg.isForwarded,
              forwardedFrom: replyMsg.forwardedFrom,
              rawEventIds: replyMsg.rawEventIds,
            },
          };
          parent.replies.push(domainReply);
          // Also attach any resources in reply to parent discussion
          if (replyMsg.resources.length > 0 && !replyMsg.isDeleted) {
            parent.resources.push(...replyMsg.resources);
          }
        } else {
          // Missing parent message -> Orphaned discussion!
          // Mark with hasMissingParent: true, do NOT fabricate fake parent
          replyMsg.hasMissingParent = true;
          rootDiscussions.push(replyMsg);
        }
      }

      // Convert root working messages into final immutable domain Discussions
      for (const root of rootDiscussions) {
        const communityId = communityIdMapper(root.externalCommunityId);
        const internalId = `disc_${root.provider}_${root.externalMessageId}`;

        const provenance: SourceProvenance = {
          provider: root.provider,
          externalCommunityId: root.externalCommunityId,
          externalMessageId: root.externalMessageId,
          externalParentMessageId: root.externalParentMessageId,
          externalThreadId: root.externalThreadId,
          externalAuthorId: root.author.id,
          originalTimestamp: root.createdAt,
          ingestedAt,
          isEdited: root.isEdited,
          editedAt: root.editedAt,
          isDeleted: root.isDeleted,
          deletedAt: root.deletedAt,
          isForwarded: root.isForwarded,
          forwardedFrom: root.forwardedFrom,
          hasMissingParent: root.hasMissingParent,
          rawEventIds: root.rawEventIds,
        };

        const activeReplies = root.replies.filter(r => !r.isDeleted);

        const discussion: Discussion = {
          id: internalId,
          communityId,
          roadmapItemId: root.roadmapItemId,
          topicTitle: root.topicTitle,
          author: root.author,
          title: root.title,
          content: root.content,
          type: root.type,
          signalQuality: root.signalQuality,
          consensusStatus: root.consensusStatus,
          createdAt: root.createdAt,
          isResolved: root.isResolved,
          resolutionSummary: root.resolutionSummary,
          resolvedBy: root.resolvedBy,
          perspectiveSummary: root.perspectiveSummary,
          isDeleted: root.isDeleted,
          sourceProvenance: provenance,
          resources: root.resources.map(res => ({
            ...res,
            sourceDiscussionId: internalId,
            sourceRoadmapItemId: root.roadmapItemId,
          })),
          replies: root.replies,
          replyCount: activeReplies.length,
        };

        normalizedDiscussions.push(discussion);
      }
    }

    return normalizedDiscussions;
  }

  private static normalizeAuthor(authorRef?: ExternalAuthorRef): DiscussionAuthor {
    if (!authorRef) {
      return {
        id: 'unknown_user',
        name: 'Unknown Member',
        avatarUrl: '',
        role: 'member',
      };
    }

    return {
      id: authorRef.externalUserId || 'unknown_user',
      name: authorRef.displayName || 'Community Member',
      avatarUrl: authorRef.avatarUrl || '',
      role: authorRef.roleHint || 'member',
    };
  }

  private static deriveTitle(content: string, topicHint?: string): string {
    const trimmed = content.trim();
    if (!trimmed) {
      return topicHint ? `Update on ${topicHint}` : 'Community Update';
    }

    // Use the first sentence or first 80 characters
    const firstLine = trimmed.split('\n')[0];
    const sentenceMatch = firstLine.match(/^(.+?[\.\?\!])(\s|$)/);
    if (sentenceMatch && sentenceMatch[1].length >= 10 && sentenceMatch[1].length <= 90) {
      return sentenceMatch[1].trim();
    }

    if (firstLine.length <= 80) {
      return firstLine;
    }

    return `${firstLine.slice(0, 77)}...`;
  }

  private static classifyContent(
    content: string,
    eventType: string
  ): { type: DiscussionType; signalQuality: SignalQuality } {
    const trimmed = content.trim();

    if (eventType === 'member_joined' || eventType === 'member_left') {
      return { type: 'social_chatter', signalQuality: 'low_signal' };
    }

    if (!trimmed || trimmed.length <= 2) {
      return { type: 'social_chatter', signalQuality: 'low_signal' };
    }

    // Check against noise patterns
    for (const pattern of NOISE_PATTERNS) {
      if (pattern.test(trimmed)) {
        return { type: 'social_chatter', signalQuality: 'low_signal' };
      }
    }

    // Question classification
    const isQuestion =
      trimmed.endsWith('?') ||
      /\b(how|what|why|when|where|can we|is there|is it possible|which approach)\b/i.test(trimmed);

    if (isQuestion && trimmed.length >= 15) {
      return { type: 'question', signalQuality: 'high_signal' };
    }

    // Resource check
    if (/https?:\/\/[^\s]+/i.test(trimmed) && trimmed.length < 150) {
      return { type: 'resource', signalQuality: 'high_signal' };
    }

    if (trimmed.length > 100) {
      return { type: 'discussion', signalQuality: 'high_signal' };
    }

    return { type: 'discussion', signalQuality: 'normal' };
  }

  private static extractResources(
    provider: string,
    messageId: string,
    content: string,
    explicitResources?: ExternalResourceRef[],
    attributedBy?: string
  ): DiscussionResource[] {
    const resources: DiscussionResource[] = [];
    const seenUrls = new Set<string>();

    if (explicitResources) {
      explicitResources.forEach((res, idx) => {
        if (!seenUrls.has(res.url)) {
          seenUrls.add(res.url);
          resources.push({
            id: `res_${provider}_${messageId}_${idx + 1}`,
            title: res.title || this.inferResourceTitle(res.url),
            url: res.url,
            type: res.type || this.inferResourceType(res.url),
            attributedBy,
          });
        }
      });
    }

    // Extract URLs from text
    const urlMatches = content.match(/https?:\/\/[^\s\)\"\'\>]+/gi) || [];
    urlMatches.forEach((url: string, idx: number) => {
      // Clean trailing punctuation
      const cleanUrl = url.replace(/[\.\,\;\:]$/, '');
      if (!seenUrls.has(cleanUrl)) {
        seenUrls.add(cleanUrl);
        resources.push({
          id: `res_${provider}_${messageId}_text_${idx + 1}`,
          title: this.inferResourceTitle(cleanUrl),
          url: cleanUrl,
          type: this.inferResourceType(cleanUrl),
          attributedBy,
        });
      }
    });

    return resources;
  }

  private static inferResourceType(url: string): 'link' | 'github' | 'paper' | 'guide' {
    const lower = url.toLowerCase();
    if (lower.includes('github.com') || lower.includes('gitlab.com')) {
      return 'github';
    }
    if (lower.includes('arxiv.org') || lower.includes('.pdf') || lower.includes('paper')) {
      return 'paper';
    }
    if (lower.includes('docs.') || lower.includes('guide') || lower.includes('manual')) {
      return 'guide';
    }
    return 'link';
  }

  private static inferResourceTitle(url: string): string {
    try {
      const parsed = new URL(url);
      const pathname = parsed.pathname.replace(/\/$/, '');
      const segments = pathname.split('/').filter(Boolean);
      if (segments.length > 0) {
        const last = segments[segments.length - 1];
        if (last && typeof last === 'string') {
          return decodeURIComponent(last.replace(/[-_]/g, ' '));
        }
      }
      return parsed.hostname;
    } catch {
      return 'Shared Resource';
    }
  }
}
