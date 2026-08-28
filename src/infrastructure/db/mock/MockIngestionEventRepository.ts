import { IIngestionEventRepository } from '../../../core/repositories/IIngestionEventRepository';
import { IngestionEvent, IngestionStatus } from '../../../core/domain/ingestion';

export class MockIngestionEventRepository implements IIngestionEventRepository {
  private events: Map<string, IngestionEvent> = new Map();

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

  async recordReceived(
    provider: string,
    externalCommunityId: string,
    externalEventId: string
  ): Promise<IngestionEvent> {
    const eventKey = `${provider}:${externalCommunityId}:${externalEventId}`;
    const existing = this.events.get(eventKey);
    if (existing) {
      return { ...existing };
    }

    const id = `ingest_${provider}_${externalCommunityId}_${externalEventId}_${Date.now()}`;
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
  }

  async updateStatus(
    id: string,
    status: IngestionStatus,
    error?: string,
    processedAt?: Date
  ): Promise<IngestionEvent> {
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

    target.status = status;
    if (error !== undefined) target.error = error;
    if (processedAt !== undefined) target.processedAt = processedAt;
    if (status === 'processing') target.retryCount = (target.retryCount || 0) + 1;

    return { ...target };
  }

  async getAllEvents(): Promise<IngestionEvent[]> {
    return Array.from(this.events.values()).map((e) => ({ ...e }));
  }

  async clear(): Promise<void> {
    this.events.clear();
  }
}
