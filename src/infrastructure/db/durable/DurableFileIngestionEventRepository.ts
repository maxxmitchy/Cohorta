import * as path from 'path';
import {
  IIngestionEventRepository,
  IngestionClaimResult,
  ClaimEventOptions,
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
        const newEvent: IngestionEvent = {
          id,
          provider,
          externalCommunityId,
          externalEventId,
          eventKey,
          receivedAt: now,
          lastAttemptAt: now,
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

        // Stale in-flight processing -> recover & reclaim
        existing.status = 'processing';
        existing.retryCount = (existing.retryCount || 0) + 1;
        existing.lastAttemptAt = now;
        return { outcome: 'recovered_stale', record: { ...existing } };
      }

      if (existing.status === 'failed') {
        // Retry failed event
        existing.status = 'processing';
        existing.retryCount = (existing.retryCount || 0) + 1;
        existing.lastAttemptAt = now;
        existing.error = undefined;
        return { outcome: 'claimed', record: { ...existing } };
      }

      // Existing status is 'received'
      existing.status = 'processing';
      existing.retryCount = (existing.retryCount || 0) + 1;
      existing.lastAttemptAt = now;
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
    processedAt?: Date
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
