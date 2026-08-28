import { IngestionEvent, IngestionStatus } from '../domain/ingestion';

export type IngestionClaimOutcome =
  | 'claimed'
  | 'already_processed'
  | 'in_flight'
  | 'recovered_stale';

export interface IngestionClaimResult {
  outcome: IngestionClaimOutcome;
  record: IngestionEvent;
}

export interface ClaimEventOptions {
  /** Time in ms after which an in-flight 'processing' event is considered stale and eligible for retry */
  staleTimeoutMs?: number;
}

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
   * Atomically claims ownership of an ingestion event:
   * - If not found: creates record with status 'processing' and returns 'claimed'.
   * - If already 'processed': returns 'already_processed'.
   * - If 'processing' and within stale timeout: returns 'in_flight' (prevents concurrent duplicate work).
   * - If 'processing' and elapsed time exceeds staleTimeoutMs: transitions to 'processing', increments retryCount, and returns 'recovered_stale'.
   * - If 'failed' or 'received': transitions to 'processing', increments retryCount, and returns 'claimed'.
   */
  claimEvent(
    provider: string,
    externalCommunityId: string,
    externalEventId: string,
    options?: ClaimEventOptions
  ): Promise<IngestionClaimResult>;

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
