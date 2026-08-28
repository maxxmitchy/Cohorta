import { IngestionEvent, IngestionStatus } from '../domain/ingestion';

export interface IIngestionEventRepository {
  /**
   * Find an ingestion event by its unique provider-scoped event key.
   */
  findByEventKey(eventKey: string): Promise<IngestionEvent | null>;

  /**
   * Find an ingestion event by internal ID.
   */
  findById(id: string): Promise<IngestionEvent | null>;

  /**
   * Record a newly received ingestion event (or return existing if already recorded).
   */
  recordReceived(
    provider: string,
    externalCommunityId: string,
    externalEventId: string
  ): Promise<IngestionEvent>;

  /**
   * Update status, error message, and timestamps for an ingestion event.
   */
  updateStatus(
    id: string,
    status: IngestionStatus,
    error?: string,
    processedAt?: Date
  ): Promise<IngestionEvent>;

  /**
   * Return all stored ingestion events (e.g. for debugging, metrics, testing).
   */
  getAllEvents(): Promise<IngestionEvent[]>;

  /**
   * Clear all records (testing utility).
   */
  clear(): Promise<void>;
}
