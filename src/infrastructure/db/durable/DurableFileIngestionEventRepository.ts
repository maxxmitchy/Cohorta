import * as path from 'path';
import {
  IIngestionEventRepository,
  IngestionClaimResult,
  ClaimEventOptions,
  UpdateStatusOptions,
  StaleOwnershipError,
} from '../../../core/repositories/IIngestionEventRepository';
import { IngestionEvent, IngestionStatus } from '../../../core/domain/ingestion';
import { DurableFileStorage } from './DurableFileStorage';

export interface IngestionEventStorageModel {
  events: Record<string, IngestionEvent>; // key: eventKey
}

export class DurableFileIngestionEventRepository implements IIngestionEventRepository {
  private readonly storage: DurableFileStorage<IngestionEventStorageModel>;

  constructor(filePath?: string) {
    const targetPath = filePath || path.join(process.cwd(), '.data', 'ingestion_events.json');
    this.storage = new DurableFileStorage<IngestionEventStorageModel>(
      targetPath,
      () => ({ events: {} })
    );
  }

  private generateOwnerToken(eventId: string, retryCount: number): string {
    return `own_${eventId}_att${retryCount}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  async findByEventKey(eventKey: string): Promise<IngestionEvent | null> {
    const data = await this.storage.read();
    const event = data.events[eventKey];
    return event ? { ...event } : null;
  }

  async findById(id: string): Promise<IngestionEvent | null> {
    const data = await this.storage.read();
    for (const event of Object.values(data.events)) {
      if (event.id === id) {
        return { ...event };
      }
    }
    return null;
  }

  async claimEvent(
    provider: string,
    externalCommunityId: string,
    externalEventId: string,
    options?: ClaimEventOptions
  ): Promise<IngestionClaimResult> {
    const staleTimeoutMs = options?.staleTimeoutMs ?? 30_000;
    const eventKey = `${provider}:${externalCommunityId}:${externalEventId}`;
    const now = new Date();

    return this.storage.mutate((data) => {
      const existing = data.events[eventKey];

      if (!existing) {
        const sanitizedCommId = externalCommunityId.replace(/[^a-zA-Z0-9_]/g, '_');
        const id = `ingest_${provider}_${sanitizedCommId}_${externalEventId}_${Date.now()}`;
        const ownerToken = this.generateOwnerToken(id, 1);
        const newEvent: IngestionEvent = {
          id,
          provider,
          externalCommunityId,
          externalEventId,
          eventKey,
          receivedAt: now,
          lastAttemptAt: now,
          ownerToken,
          status: 'processing',
          retryCount: 1,
        };
        data.events[eventKey] = newEvent;
        return { outcome: 'claimed', record: { ...newEvent } };
      }

      if (existing.status === 'processed') {
        return { outcome: 'already_processed', record: { ...existing } };
      }

      if (existing.status === 'processing') {
        const lastAttempt = existing.lastAttemptAt || existing.receivedAt;
        const elapsed = now.getTime() - new Date(lastAttempt).getTime();

        if (elapsed < staleTimeoutMs) {
          // In-flight active processing by another worker/thread
          return { outcome: 'in_flight', record: { ...existing } };
        }

        // Stale in-flight processing -> recover & reclaim with NEW ownerToken
        const newRetryCount = (existing.retryCount || 0) + 1;
        existing.status = 'processing';
        existing.retryCount = newRetryCount;
        existing.lastAttemptAt = now;
        existing.ownerToken = this.generateOwnerToken(existing.id, newRetryCount);
        return { outcome: 'recovered_stale', record: { ...existing } };
      }

      if (existing.status === 'failed') {
        // Retry failed event
        const newRetryCount = (existing.retryCount || 0) + 1;
        existing.status = 'processing';
        existing.retryCount = newRetryCount;
        existing.lastAttemptAt = now;
        existing.ownerToken = this.generateOwnerToken(existing.id, newRetryCount);
        existing.error = undefined;
        return { outcome: 'claimed', record: { ...existing } };
      }

      // Existing status is 'received'
      const newRetryCount = (existing.retryCount || 0) + 1;
      existing.status = 'processing';
      existing.retryCount = newRetryCount;
      existing.lastAttemptAt = now;
      existing.ownerToken = this.generateOwnerToken(existing.id, newRetryCount);
      return { outcome: 'claimed', record: { ...existing } };
    });
  }

  async recordReceived(
    provider: string,
    externalCommunityId: string,
    externalEventId: string
  ): Promise<IngestionEvent> {
    const eventKey = `${provider}:${externalCommunityId}:${externalEventId}`;

    return this.storage.mutate((data) => {
      if (data.events[eventKey]) {
        return { ...data.events[eventKey] };
      }

      const sanitizedCommId = externalCommunityId.replace(/[^a-zA-Z0-9_]/g, '_');
      const id = `ingest_${provider}_${sanitizedCommId}_${externalEventId}_${Date.now()}`;
      const event: IngestionEvent = {
        id,
        provider,
        externalCommunityId,
        externalEventId,
        eventKey,
        receivedAt: new Date(),
        status: 'received',
        retryCount: 0,
      };

      data.events[eventKey] = event;
      return { ...event };
    });
  }

  async updateStatus(
    id: string,
    status: IngestionStatus,
    error?: string,
    processedAt?: Date,
    options?: UpdateStatusOptions
  ): Promise<IngestionEvent> {
    return this.storage.mutate((data) => {
      let target: IngestionEvent | undefined;

      for (const event of Object.values(data.events)) {
        if (event.id === id) {
          target = event;
          break;
        }
      }

      if (!target) {
        throw new Error(`IngestionEvent with id "${id}" not found`);
      }

      // If an expected owner token is provided, verify it matches stored token
      if (options?.expectedOwnerToken && target.ownerToken !== options.expectedOwnerToken) {
        throw new StaleOwnershipError(
          `Cannot update event "${id}" status to "${status}": expected ownerToken "${options.expectedOwnerToken}", but current ownerToken is "${target.ownerToken}". Processing was superseded or recovered by another worker.`
        );
      }

      target.status = status;
      if (error !== undefined) target.error = error;
      if (processedAt !== undefined) target.processedAt = processedAt;
      if (status === 'processing') {
        target.retryCount = (target.retryCount || 0) + 1;
        target.lastAttemptAt = new Date();
      }

      return { ...target };
    });
  }

  async getAllEvents(): Promise<IngestionEvent[]> {
    const data = await this.storage.read();
    return Object.values(data.events).map((e) => ({ ...e }));
  }

  async clear(): Promise<void> {
    await this.storage.mutate((data) => {
      data.events = {};
    });
  }
}
