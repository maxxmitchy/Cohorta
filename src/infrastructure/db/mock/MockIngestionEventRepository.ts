import {
  IIngestionEventRepository,
  IngestionClaimResult,
  ClaimEventOptions,
  UpdateStatusOptions,
  StaleOwnershipError,
} from '../../../core/repositories/IIngestionEventRepository';
import { IngestionEvent, IngestionStatus } from '../../../core/domain/ingestion';

export class MockIngestionEventRepository implements IIngestionEventRepository {
  private events: Map<string, IngestionEvent> = new Map();
  private lock: Promise<void> = Promise.resolve();

  private generateOwnerToken(eventId: string, retryCount: number): string {
    return `own_${eventId}_att${retryCount}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private async runWithLock<T>(fn: () => T | Promise<T>): Promise<T> {
    let result!: T;
    const task = async () => {
      result = await fn();
    };
    this.lock = this.lock.catch(() => {}).then(task);
    await this.lock;
    return result;
  }

  async findByEventKey(eventKey: string): Promise<IngestionEvent | null> {
    const event = this.events.get(eventKey);
    return event ? { ...event } : null;
  }

  async findById(id: string): Promise<IngestionEvent | null> {
    for (const event of this.events.values()) {
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
    return this.runWithLock(async () => {
      const staleTimeoutMs = options?.staleTimeoutMs ?? 30_000;
      const eventKey = `${provider}:${externalCommunityId}:${externalEventId}`;
      const now = new Date();
      const existing = this.events.get(eventKey);

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
        this.events.set(eventKey, newEvent);
        return { outcome: 'claimed', record: { ...newEvent } };
      }

      if (existing.status === 'processed') {
        return { outcome: 'already_processed', record: { ...existing } };
      }

      if (existing.status === 'processing') {
        const lastAttempt = existing.lastAttemptAt || existing.receivedAt;
        const elapsed = now.getTime() - new Date(lastAttempt).getTime();

        if (elapsed < staleTimeoutMs) {
          // Actively in-flight
          return { outcome: 'in_flight', record: { ...existing } };
        }

        // Stale in-flight -> recover & reclaim with new ownerToken
        const newRetryCount = (existing.retryCount || 0) + 1;
        existing.status = 'processing';
        existing.retryCount = newRetryCount;
        existing.lastAttemptAt = now;
        existing.ownerToken = this.generateOwnerToken(existing.id, newRetryCount);
        return { outcome: 'recovered_stale', record: { ...existing } };
      }

      if (existing.status === 'failed') {
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
    return this.runWithLock(async () => {
      const eventKey = `${provider}:${externalCommunityId}:${externalEventId}`;
      const existing = this.events.get(eventKey);
      if (existing) {
        return { ...existing };
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

      this.events.set(eventKey, event);
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
    return this.runWithLock(async () => {
      let target: IngestionEvent | undefined;
      for (const ev of this.events.values()) {
        if (ev.id === id) {
          target = ev;
          break;
        }
      }

      if (!target) {
        throw new Error(`IngestionEvent with id "${id}" not found`);
      }

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
    return Array.from(this.events.values()).map((e) => ({ ...e }));
  }

  async clear(): Promise<void> {
    return this.runWithLock(async () => {
      this.events.clear();
    });
  }
}
