import * as path from 'path';
import { IIngestionEventRepository } from '../../../core/repositories/IIngestionEventRepository';
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

  async recordReceived(
    provider: string,
    externalCommunityId: string,
    externalEventId: string
  ): Promise<IngestionEvent> {
    const data = await this.storage.read();
    const eventKey = `${provider}:${externalCommunityId}:${externalEventId}`;

    if (data.events[eventKey]) {
      return { ...data.events[eventKey] };
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

    data.events[eventKey] = event;
    await this.storage.write(data);
    return { ...event };
  }

  async updateStatus(
    id: string,
    status: IngestionStatus,
    error?: string,
    processedAt?: Date
  ): Promise<IngestionEvent> {
    const data = await this.storage.read();
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
    if (status === 'processing') target.retryCount = (target.retryCount || 0) + 1;

    await this.storage.write(data);
    return { ...target };
  }

  async getAllEvents(): Promise<IngestionEvent[]> {
    const data = await this.storage.read();
    return Object.values(data.events).map((e) => ({ ...e }));
  }

  async clear(): Promise<void> {
    await this.storage.write({ events: {} });
  }
}
