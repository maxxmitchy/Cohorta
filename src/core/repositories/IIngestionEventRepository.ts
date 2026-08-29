import { IngestionEvent, IngestionStatus } from '../domain/ingestion';

export type IngestionClaimOutcome =
  | 'claimed'
  | 'already_processed'
  | 'in_flight'
  | 'recovered_stale'
  | 'permanently_failed';

export interface IngestionClaimResult {
  outcome: IngestionClaimOutcome;
  record: IngestionEvent;
}

export interface ClaimEventOptions {
  /** Time in ms after which an in-flight 'processing' event is considered stale and eligible for retry */
  staleTimeoutMs?: number;
  /** Maximum retry attempts before an event transitions to permanently_failed */
  maxRetries?: number;
  /** Optional sanitized source payload to associate with the ingestion event */
  payload?: Record<string, unknown>;
}

export interface UpdateStatusOptions {
  /**
   * If supplied, the status will only be updated if the repository record's
   * current ownerToken matches expectedOwnerToken. Otherwise, a StaleOwnershipError is thrown.
   */
  expectedOwnerToken?: string;
  /** Optional sanitized payload to update on the event */
  payload?: Record<string, unknown>;
  /** Optional reset of retryCount (e.g. for manual operator replay) */
  resetRetryCount?: boolean;
}

export class StaleOwnershipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StaleOwnershipError';
  }
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
   * - If not found: creates record with status 'processing', generates unique ownerToken, and returns 'claimed'.
   * - If already 'processed': returns 'already_processed'.
   * - If 'permanently_failed': returns 'permanently_failed'.
   * - If 'processing' and within stale timeout: returns 'in_flight' (prevents concurrent duplicate work).
   * - If 'processing' and elapsed time exceeds staleTimeoutMs:
   *     - If (retryCount >= maxRetries): marks as 'permanently_failed' and returns 'permanently_failed'.
   *     - Else: transitions to 'processing', increments retryCount, assigns new ownerToken, and returns 'recovered_stale'.
   * - If 'failed':
   *     - If (retryCount >= maxRetries): marks as 'permanently_failed' and returns 'permanently_failed'.
   *     - Else: transitions to 'processing', increments retryCount, assigns new ownerToken, and returns 'claimed'.
   * - If 'received': transitions to 'processing', increments retryCount, assigns new ownerToken, and returns 'claimed'.
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
    externalEventId: string,
    payload?: Record<string, unknown>
  ): Promise<IngestionEvent>;

  /**
   * Update status, error message, and timestamps for an ingestion event.
   * If options.expectedOwnerToken is provided and does not match the stored ownerToken,
   * a StaleOwnershipError is thrown.
   */
  updateStatus(
    id: string,
    status: IngestionStatus,
    error?: string,
    processedAt?: Date,
    options?: UpdateStatusOptions
  ): Promise<IngestionEvent>;

  /**
   * Explicitly transition an event to permanently_failed dead-letter state.
   */
  markPermanentlyFailed(id: string, error?: string): Promise<IngestionEvent>;

  /**
   * Find failed events eligible for replay or dead-letter inspection.
   */
  findFailedEvents(options?: {
    provider?: string;
    limit?: number;
    includePermanentlyFailed?: boolean;
  }): Promise<IngestionEvent[]>;

  /**
   * Find stale processing events that exceeded their staleTimeoutMs.
   */
  findStaleEvents(
    staleTimeoutMs: number,
    options?: { provider?: string; limit?: number }
  ): Promise<IngestionEvent[]>;

  /**
   * Return all stored ingestion events (e.g. for debugging, metrics, testing).
   */
  getAllEvents(): Promise<IngestionEvent[]>;

  /**
   * Clear all records (testing utility).
   */
  clear(): Promise<void>;
}

