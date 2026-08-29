import {
  ICommunityEventIngestionService,
  SingleEventIngestionResult,
  IngestionBatchResult,
} from './ICommunityEventIngestionService';
import { ExternalCommunitySourceEvent } from '../source/ExternalCommunitySourceEvent';
import { IIngestionEventRepository } from '../repositories/IIngestionEventRepository';
import { ICommunityHistoryRepository } from '../repositories/ICommunityHistoryRepository';
import { ICommunityIntegrationRepository } from '../repositories/ICommunityIntegrationRepository';
import { Discussion, DiscussionReply, DiscussionResource } from '../domain/discussion';
import { IngestionEvent } from '../domain/ingestion';
import { CommunityHistoryNormalizer } from '../source/CommunityHistoryNormalizer';

export interface CommunityEventIngestionOptions {
  /** Fallback Cohorta communityId if no explicit integration is found */
  fallbackCommunityId?: string;
  /** Default roadmap item ID if not present in the source event */
  defaultRoadmapItemId?: string;
  /** Multi-message consecutive window in ms (defaults to 5 minutes) */
  multiMessageWindowMs?: number;
  /** Stale timeout in ms for in-flight processing recovery (defaults to 30s) */
  staleTimeoutMs?: number;
  /** Max retry attempts before permanently failing an event */
  maxRetries?: number;
}

/**
 * Provider-Agnostic Core Ingestion Service.
 *
 * Coordinates:
 * 1. Durable provider-scoped event idempotency via atomic event claiming.
 * 2. Explicit lifecycle state transitions (received -> processing -> processed / failed / permanently_failed).
 * 3. Provider-to-Cohorta community mapping.
 * 4. Normalization and message lifecycle (creation, in-place edit, reply hierarchy, out-of-order reconciliation, deletion).
 * 5. Durable persistence of normalized community discussions and resources.
 */
export class CommunityEventIngestionService implements ICommunityEventIngestionService {
  constructor(
    private readonly ingestionRepo: IIngestionEventRepository,
    private readonly historyRepo: ICommunityHistoryRepository,
    private readonly integrationRepo: ICommunityIntegrationRepository,
    private readonly options: CommunityEventIngestionOptions = {}
  ) {}

  async ingestEvent(event: ExternalCommunitySourceEvent): Promise<SingleEventIngestionResult> {
    const eventKey = `${event.provider}:${event.externalCommunityId}:${event.externalEventId}`;

    // 1. Atomically claim ownership of the event
    const claim = await this.ingestionRepo.claimEvent(
      event.provider,
      event.externalCommunityId,
      event.externalEventId,
      {
        staleTimeoutMs: this.options.staleTimeoutMs ?? 30_000,
        maxRetries: this.options.maxRetries,
      }
    );

    if (
      claim.outcome === 'already_processed' ||
      claim.outcome === 'in_flight' ||
      claim.outcome === 'permanently_failed'
    ) {
      return {
        outcome: 'duplicate_ignored',
        eventKey,
        externalEventId: event.externalEventId,
        ingestionRecord: claim.record,
      };
    }

    const ingestionRecord = claim.record;

    try {
      // 2. Resolve target Cohorta community ID
      const communityId = await this.resolveCommunityId(event.provider, event.externalCommunityId);
      const defaultRoadmapItemId = this.options.defaultRoadmapItemId || 'general';
      const multiMessageWindowMs = this.options.multiMessageWindowMs ?? 5 * 60 * 1000;

      const affectedDiscussions: Discussion[] = [];

      // 3. Process according to source event type
      if (event.eventType === 'message_deleted') {
        await this.handleMessageDeleted(event, communityId, affectedDiscussions);
      } else if (event.eventType === 'message_edited') {
        await this.handleMessageEdited(event, communityId, defaultRoadmapItemId, affectedDiscussions);
      } else {
        // Message / Reply / Post creation
        if (event.externalParentMessageId || event.eventType === 'reply_created') {
          await this.handleReplyCreated(event, communityId, defaultRoadmapItemId, affectedDiscussions);
        } else {
          await this.handleRootMessageCreated(
            event,
            communityId,
            defaultRoadmapItemId,
            multiMessageWindowMs,
            affectedDiscussions
          );
        }
      }

      // 4. Mark ingestion as successfully processed with ownership token verification
      const updatedRecord = await this.ingestionRepo.updateStatus(
        ingestionRecord.id,
        'processed',
        undefined,
        new Date(),
        { expectedOwnerToken: ingestionRecord.ownerToken }
      );

      // 5. Update integration metrics if integration exists
      try {
        const integration = await this.integrationRepo.findByProviderCommunityId(event.provider, event.externalCommunityId);
        if (integration) {
          integration.lastSuccessfulIngestionAt = new Date();
          integration.lastProcessingError = undefined;
          await this.integrationRepo.saveIntegration(integration);
        }
      } catch (intErr) {
        console.warn(`[IngestionService] Could not update integration metadata for ${event.provider}:${event.externalCommunityId}:`, intErr);
      }

      return {
        outcome: 'processed',
        eventKey,
        externalEventId: event.externalEventId,
        ingestionRecord: updatedRecord,
        discussionsAffected: affectedDiscussions,
      };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      let failedRecord = ingestionRecord;
      try {
        failedRecord = await this.ingestionRepo.updateStatus(
          ingestionRecord.id,
          'failed',
          errorMessage,
          undefined,
          { expectedOwnerToken: ingestionRecord.ownerToken }
        );
      } catch (statusErr) {
        // If ownership was superseded, statusErr is expected (StaleOwnershipError)
        console.warn(`[IngestionService] Failed to set failure status for event ${ingestionRecord.id}:`, statusErr);
      }

      // Update integration error metrics if integration exists
      try {
        const integration = await this.integrationRepo.findByProviderCommunityId(event.provider, event.externalCommunityId);
        if (integration) {
          integration.lastFailedIngestionAt = new Date();
          integration.lastProcessingError = errorMessage;
          await this.integrationRepo.saveIntegration(integration);
        }
      } catch (intErr) {
        console.warn(`[IngestionService] Could not record failure on integration for ${event.provider}:${event.externalCommunityId}:`, intErr);
      }

      return {
        outcome: 'failed',
        eventKey,
        externalEventId: event.externalEventId,
        error: errorMessage,
        ingestionRecord: failedRecord,
      };
    }
  }

  async ingestBatch(events: ExternalCommunitySourceEvent[]): Promise<IngestionBatchResult> {
    const results: SingleEventIngestionResult[] = [];
    let processedCount = 0;
    let duplicateCount = 0;
    let failedCount = 0;

    for (const event of events) {
      const res = await this.ingestEvent(event);
      results.push(res);
      if (res.outcome === 'processed') processedCount++;
      else if (res.outcome === 'duplicate_ignored') duplicateCount++;
      else if (res.outcome === 'failed') failedCount++;
    }

    return {
      totalReceived: events.length,
      processedCount,
      duplicateCount,
      failedCount,
      results,
    };
  }

  // --- INTERNAL MESSAGE LIFECYCLE HANDLERS ---

  private async handleRootMessageCreated(
    event: ExternalCommunitySourceEvent,
    communityId: string,
    defaultRoadmapItemId: string,
    multiMessageWindowMs: number,
    affectedDiscussions: Discussion[]
  ): Promise<void> {
    const rawContent = event.content ?? '';
    const author = CommunityHistoryNormalizer.normalizeAuthor(event.author);
    const classification = CommunityHistoryNormalizer.classifyContent(rawContent, event.eventType);
    const sanitizedCommId = event.externalCommunityId.replace(/[^a-zA-Z0-9_]/g, '_');
    const discId = `disc_${event.provider}_${sanitizedCommId}_${event.externalMessageId}`;
    const roadmapItemId = event.roadmapItemId || defaultRoadmapItemId;
    const topicTitle = event.topicHint || 'General';

    // 1. Check if discussion already exists (e.g. previously arrived create, edit, or merged message)
    const existing = await this.historyRepo.findDiscussionByProvenance(
      event.provider,
      event.externalCommunityId,
      event.externalMessageId
    );

    if (existing) {
      // Check if this event was already merged as a consecutive message
      const isMerged = existing.sourceProvenance?.mergedExternalMessageIds?.includes(event.externalMessageId);

      if (!isMerged) {
        // Direct root discussion update (e.g. retry or out-of-order re-arrival)
        existing.content = rawContent;
        existing.title = CommunityHistoryNormalizer.deriveTitle(rawContent, topicTitle);
        existing.type = classification.type;
        existing.signalQuality = classification.signalQuality;
      }

      existing.sourceProvenance = existing.sourceProvenance || {
        provider: event.provider,
        externalCommunityId: event.externalCommunityId,
        externalMessageId: event.externalMessageId,
        originalTimestamp: event.timestamp,
        ingestedAt: new Date(),
        rawEventIds: [event.externalEventId],
      };

      if (!existing.sourceProvenance.rawEventIds) {
        existing.sourceProvenance.rawEventIds = [];
      }
      if (!existing.sourceProvenance.rawEventIds.includes(event.externalEventId)) {
        existing.sourceProvenance.rawEventIds.push(event.externalEventId);
      }

      await this.historyRepo.saveDiscussion(existing);
      affectedDiscussions.push(existing);
      return;
    }

    // 2. Check for out-of-order orphan replies that were waiting for this parent message!
    const allDiscussions = await this.historyRepo.getAllDiscussions(communityId);
    const orphanReplies: DiscussionReply[] = [];
    const orphanDiscussionIdsToDelete: string[] = [];

    for (const d of allDiscussions) {
      if (
        d.sourceProvenance?.hasMissingParent &&
        d.sourceProvenance.externalParentMessageId === event.externalMessageId &&
        d.sourceProvenance.provider === event.provider &&
        d.sourceProvenance.externalCommunityId === event.externalCommunityId
      ) {
        orphanReplies.push({
          id: `rep_${d.sourceProvenance.provider}_${sanitizedCommId}_${d.sourceProvenance.externalMessageId}`,
          author: d.author,
          content: d.content,
          createdAt: d.createdAt,
          isAnswer: d.consensusStatus === 'resolved',
          stance: 'neutral',
          isDeleted: d.isDeleted,
          sourceProvenance: {
            ...d.sourceProvenance,
            hasMissingParent: false,
          },
        });
        orphanDiscussionIdsToDelete.push(d.id);
      }
    }

    // Clean up orphan placeholder discussions
    for (const orphanId of orphanDiscussionIdsToDelete) {
      await this.historyRepo.deleteDiscussion(communityId, orphanId);
    }

    // 3. Multi-message consecutive grouping check:
    // If previous root discussion was from the same author, same topic, within multiMessageWindowMs, with 0 replies
    const sortedDiscussions = allDiscussions
      .filter((d) => !orphanDiscussionIdsToDelete.includes(d.id))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    const lastDiscussion = sortedDiscussions[sortedDiscussions.length - 1];
    if (
      lastDiscussion &&
      lastDiscussion.author.id === author.id &&
      lastDiscussion.roadmapItemId === roadmapItemId &&
      !lastDiscussion.isDeleted &&
      lastDiscussion.replies.length === 0 &&
      event.timestamp.getTime() - lastDiscussion.createdAt.getTime() <= multiMessageWindowMs &&
      event.timestamp.getTime() - lastDiscussion.createdAt.getTime() >= 0
    ) {
      // Merge into previous root
      lastDiscussion.content = `${lastDiscussion.content}\n\n${rawContent}`;
      const additionalResources = CommunityHistoryNormalizer.extractResources(
        event.provider,
        event.externalMessageId,
        rawContent,
        event.resources,
        author.name
      ).map((r) => ({
        ...r,
        sourceDiscussionId: lastDiscussion.id,
        sourceRoadmapItemId: lastDiscussion.roadmapItemId,
      }));
      lastDiscussion.resources = [...(lastDiscussion.resources || []), ...additionalResources];
      
      if (lastDiscussion.sourceProvenance) {
        if (!lastDiscussion.sourceProvenance.rawEventIds) {
          lastDiscussion.sourceProvenance.rawEventIds = [];
        }
        if (!lastDiscussion.sourceProvenance.rawEventIds.includes(event.externalEventId)) {
          lastDiscussion.sourceProvenance.rawEventIds.push(event.externalEventId);
        }
        if (!lastDiscussion.sourceProvenance.mergedExternalMessageIds) {
          lastDiscussion.sourceProvenance.mergedExternalMessageIds = [];
        }
        if (!lastDiscussion.sourceProvenance.mergedExternalMessageIds.includes(event.externalMessageId)) {
          lastDiscussion.sourceProvenance.mergedExternalMessageIds.push(event.externalMessageId);
        }
      }

      if (lastDiscussion.title.length < 20) {
        lastDiscussion.title = CommunityHistoryNormalizer.deriveTitle(
          lastDiscussion.content,
          lastDiscussion.topicTitle
        );
      }
      await this.historyRepo.saveDiscussion(lastDiscussion);
      affectedDiscussions.push(lastDiscussion);
      return;
    }

    // 4. Construct new Discussion
    const extractedResources = CommunityHistoryNormalizer.extractResources(
      event.provider,
      event.externalMessageId,
      rawContent,
      event.resources,
      author.name
    ).map((r) => ({
      ...r,
      sourceDiscussionId: discId,
      sourceRoadmapItemId: roadmapItemId,
    }));

    const newDiscussion: Discussion = {
      id: discId,
      communityId,
      roadmapItemId,
      topicTitle,
      author,
      title: CommunityHistoryNormalizer.deriveTitle(rawContent, topicTitle),
      content: rawContent,
      type: classification.type,
      signalQuality: classification.signalQuality,
      consensusStatus: event.metadata?.isResolvedHint
        ? 'resolved'
        : event.metadata?.stanceHint
        ? 'differing_perspectives'
        : undefined,
      createdAt: event.timestamp,
      isResolved: event.metadata?.isResolvedHint,
      resolutionSummary: event.metadata?.resolutionSummaryHint,
      isDeleted: false,
      sourceProvenance: {
        provider: event.provider,
        externalCommunityId: event.externalCommunityId,
        externalMessageId: event.externalMessageId,
        externalThreadId: event.externalThreadId,
        externalAuthorId: event.author?.externalUserId,
        originalTimestamp: event.timestamp,
        ingestedAt: new Date(),
        isForwarded: event.metadata?.isForwarded,
        rawEventIds: [event.externalEventId],
      },
      resources: extractedResources,
      replies: orphanReplies,
      replyCount: orphanReplies.filter((r) => !r.isDeleted).length,
    };

    await this.historyRepo.saveDiscussion(newDiscussion);
    affectedDiscussions.push(newDiscussion);
  }

  private async handleReplyCreated(
    event: ExternalCommunitySourceEvent,
    communityId: string,
    defaultRoadmapItemId: string,
    affectedDiscussions: Discussion[]
  ): Promise<void> {
    const parent = await this.historyRepo.findDiscussionByProvenance(
      event.provider,
      event.externalCommunityId,
      event.externalParentMessageId!
    );

    const author = CommunityHistoryNormalizer.normalizeAuthor(event.author);
    const rawContent = event.content ?? '';
    const sanitizedCommId = event.externalCommunityId.replace(/[^a-zA-Z0-9_]/g, '_');
    const replyId = `rep_${event.provider}_${sanitizedCommId}_${event.externalMessageId}`;

    const reply: DiscussionReply = {
      id: replyId,
      author,
      content: rawContent,
      createdAt: event.timestamp,
      isAnswer: event.metadata?.isAnswerHint,
      stance: event.metadata?.stanceHint ?? 'neutral',
      isDeleted: false,
      sourceProvenance: {
        provider: event.provider,
        externalCommunityId: event.externalCommunityId,
        externalMessageId: event.externalMessageId,
        externalParentMessageId: event.externalParentMessageId,
        externalThreadId: event.externalThreadId,
        externalAuthorId: event.author?.externalUserId,
        originalTimestamp: event.timestamp,
        ingestedAt: new Date(),
        rawEventIds: [event.externalEventId],
      },
    };

    if (parent) {
      // Attached directly to parent discussion
      const existingIdx = parent.replies.findIndex((r) => r.id === replyId);
      if (existingIdx >= 0) {
        parent.replies[existingIdx] = reply;
      } else {
        parent.replies.push(reply);
      }
      parent.replyCount = parent.replies.filter((r) => !r.isDeleted).length;

      // Extract any resources from the reply and attach to parent
      const replyResources = CommunityHistoryNormalizer.extractResources(
        event.provider,
        event.externalMessageId,
        rawContent,
        event.resources,
        author.name
      ).map((r) => ({
        ...r,
        sourceDiscussionId: parent.id,
        sourceRoadmapItemId: parent.roadmapItemId,
      }));

      if (replyResources.length > 0) {
        const existingUrls = new Set((parent.resources || []).map((res) => res.url));
        const newResources = replyResources.filter((res) => !existingUrls.has(res.url));
        parent.resources = [...(parent.resources || []), ...newResources];
      }

      await this.historyRepo.saveDiscussion(parent);
      affectedDiscussions.push(parent);
    } else {
      // Out-of-order delivery: Parent has not arrived yet
      // Store as orphan discussion with hasMissingParent flag
      const classification = CommunityHistoryNormalizer.classifyContent(rawContent, event.eventType);
      const discId = `disc_${event.provider}_${sanitizedCommId}_${event.externalMessageId}`;
      const orphanDiscussion: Discussion = {
        id: discId,
        communityId,
        roadmapItemId: event.roadmapItemId || defaultRoadmapItemId,
        topicTitle: event.topicHint || 'General',
        author,
        title: CommunityHistoryNormalizer.deriveTitle(rawContent, event.topicHint),
        content: rawContent,
        type: classification.type,
        signalQuality: classification.signalQuality,
        createdAt: event.timestamp,
        isDeleted: false,
        sourceProvenance: {
          provider: event.provider,
          externalCommunityId: event.externalCommunityId,
          externalMessageId: event.externalMessageId,
          externalParentMessageId: event.externalParentMessageId,
          externalThreadId: event.externalThreadId,
          externalAuthorId: event.author?.externalUserId,
          originalTimestamp: event.timestamp,
          ingestedAt: new Date(),
          hasMissingParent: true,
          rawEventIds: [event.externalEventId],
        },
        resources: [],
        replies: [],
        replyCount: 0,
      };

      await this.historyRepo.saveDiscussion(orphanDiscussion);
      affectedDiscussions.push(orphanDiscussion);
    }
  }

  private async handleMessageEdited(
    event: ExternalCommunitySourceEvent,
    communityId: string,
    defaultRoadmapItemId: string,
    affectedDiscussions: Discussion[]
  ): Promise<void> {
    const rawContent = event.content ?? '';

    // 1. Check if edited message is a root discussion
    const existing = await this.historyRepo.findDiscussionByProvenance(
      event.provider,
      event.externalCommunityId,
      event.externalMessageId
    );

    if (existing) {
      existing.content = rawContent;
      if (existing.sourceProvenance) {
        existing.sourceProvenance.isEdited = true;
        existing.sourceProvenance.editedAt = event.timestamp;
        if (!existing.sourceProvenance.rawEventIds?.includes(event.externalEventId)) {
          existing.sourceProvenance.rawEventIds?.push(event.externalEventId);
        }
      }
      // Re-evaluate classification & title
      const classification = CommunityHistoryNormalizer.classifyContent(rawContent, event.eventType);
      existing.type = classification.type;
      existing.signalQuality = classification.signalQuality;
      existing.title = CommunityHistoryNormalizer.deriveTitle(rawContent, event.topicHint || existing.topicTitle);

      // Re-extract resources
      const newResources = CommunityHistoryNormalizer.extractResources(
        event.provider,
        event.externalMessageId,
        rawContent,
        event.resources,
        existing.author.name
      ).map((r) => ({
        ...r,
        sourceDiscussionId: existing.id,
        sourceRoadmapItemId: existing.roadmapItemId,
      }));
      existing.resources = newResources;

      await this.historyRepo.saveDiscussion(existing);
      affectedDiscussions.push(existing);
      return;
    }

    // 2. Check if edited message is a reply within any discussion
    const allDiscussions = await this.historyRepo.getAllDiscussions(communityId);
    for (const parent of allDiscussions) {
      const reply = parent.replies.find(
        (r) =>
          r.sourceProvenance?.provider === event.provider &&
          r.sourceProvenance?.externalCommunityId === event.externalCommunityId &&
          r.sourceProvenance?.externalMessageId === event.externalMessageId
      );

      if (reply) {
        reply.content = rawContent;
        if (reply.sourceProvenance) {
          reply.sourceProvenance.isEdited = true;
          reply.sourceProvenance.editedAt = event.timestamp;
          if (!reply.sourceProvenance.rawEventIds?.includes(event.externalEventId)) {
            reply.sourceProvenance.rawEventIds?.push(event.externalEventId);
          }
        }
        await this.historyRepo.saveDiscussion(parent);
        affectedDiscussions.push(parent);
        return;
      }
    }

    // 3. Edit arrived without prior create -> create root discussion with isEdited: true
    const author = CommunityHistoryNormalizer.normalizeAuthor(event.author);
    const classification = CommunityHistoryNormalizer.classifyContent(rawContent, event.eventType);
    const sanitizedCommId = event.externalCommunityId.replace(/[^a-zA-Z0-9_]/g, '_');
    const discId = `disc_${event.provider}_${sanitizedCommId}_${event.externalMessageId}`;
    const topicTitle = event.topicHint || 'General';

    const newDiscussion: Discussion = {
      id: discId,
      communityId,
      roadmapItemId: event.roadmapItemId || defaultRoadmapItemId,
      topicTitle,
      author,
      title: CommunityHistoryNormalizer.deriveTitle(rawContent, topicTitle),
      content: rawContent,
      type: classification.type,
      signalQuality: classification.signalQuality,
      createdAt: event.timestamp,
      isDeleted: false,
      sourceProvenance: {
        provider: event.provider,
        externalCommunityId: event.externalCommunityId,
        externalMessageId: event.externalMessageId,
        externalThreadId: event.externalThreadId,
        externalAuthorId: event.author?.externalUserId,
        originalTimestamp: event.timestamp,
        ingestedAt: new Date(),
        isEdited: true,
        editedAt: event.timestamp,
        rawEventIds: [event.externalEventId],
      },
      resources: [],
      replies: [],
      replyCount: 0,
    };

    await this.historyRepo.saveDiscussion(newDiscussion);
    affectedDiscussions.push(newDiscussion);
  }

  private async handleMessageDeleted(
    event: ExternalCommunitySourceEvent,
    communityId: string,
    affectedDiscussions: Discussion[]
  ): Promise<void> {
    // 1. Check if root discussion
    const existing = await this.historyRepo.findDiscussionByProvenance(
      event.provider,
      event.externalCommunityId,
      event.externalMessageId
    );

    if (existing) {
      existing.isDeleted = true;
      existing.resources = [];
      if (existing.sourceProvenance) {
        existing.sourceProvenance.isDeleted = true;
        existing.sourceProvenance.deletedAt = event.timestamp;
        if (!existing.sourceProvenance.rawEventIds?.includes(event.externalEventId)) {
          existing.sourceProvenance.rawEventIds?.push(event.externalEventId);
        }
      }
      await this.historyRepo.saveDiscussion(existing);
      affectedDiscussions.push(existing);
      return;
    }

    // 2. Check if reply within any discussion
    const allDiscussions = await this.historyRepo.getAllDiscussions(communityId);
    for (const parent of allDiscussions) {
      const reply = parent.replies.find(
        (r) =>
          r.sourceProvenance?.provider === event.provider &&
          r.sourceProvenance?.externalCommunityId === event.externalCommunityId &&
          r.sourceProvenance?.externalMessageId === event.externalMessageId
      );

      if (reply) {
        reply.isDeleted = true;
        if (reply.sourceProvenance) {
          reply.sourceProvenance.isDeleted = true;
          reply.sourceProvenance.deletedAt = event.timestamp;
          if (!reply.sourceProvenance.rawEventIds?.includes(event.externalEventId)) {
            reply.sourceProvenance.rawEventIds?.push(event.externalEventId);
          }
        }
        parent.replyCount = parent.replies.filter((r) => !r.isDeleted).length;
        await this.historyRepo.saveDiscussion(parent);
        affectedDiscussions.push(parent);
        return;
      }
    }
  }

  private async resolveCommunityId(provider: string, externalCommunityId: string): Promise<string> {
    const integration = await this.integrationRepo.findByProviderCommunityId(provider, externalCommunityId);
    if (!integration) {
      if (this.options.fallbackCommunityId) {
        return this.options.fallbackCommunityId;
      }
      throw new Error(`No active community integration found for ${provider}:${externalCommunityId}.`);
    }

    if (!integration.isActive) {
      throw new Error(`Community integration for ${provider}:${externalCommunityId} is disabled.`);
    }

    return integration.communityId;
  }
}
