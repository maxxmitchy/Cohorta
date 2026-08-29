import { IngestionEvent } from '../domain/ingestion';
import { ExternalCommunitySourceEvent } from '../source/ExternalCommunitySourceEvent';

export interface IngestionRecoveryOptions {
  provider?: string;
  maxRetries?: number;
  staleTimeoutMs?: number;
  batchSize?: number;
}

export interface IngestionRecoverySummary {
  scanned: number;
  retried: number;
  recovered: number;
  failed: number;
  permanentlyFailed: number;
}

/**
 * Service for recovering failed and stale in-flight ingestion events.
 *
 * Requirements:
 * 1. Honors retry count ceilings and dead-letter boundaries (permanently_failed).
 * 2. Re-routes all reprocessing strictly through the canonical ICommunityEventIngestionService.
 * 3. Never creates duplicate discussions, replies, or history logs.
 * 4. Stale workers are fenced off via ownerToken verification.
 */
export interface IIngestionRecoveryService {
  /**
   * Scan and retry recoverable failed events.
   */
  retryFailedEvents(
    eventReconstructor: (event: IngestionEvent) => Promise<ExternalCommunitySourceEvent | null>,
    options?: IngestionRecoveryOptions
  ): Promise<IngestionRecoverySummary>;

  /**
   * Scan and recover stale in-flight events.
   */
  recoverStaleEvents(
    eventReconstructor: (event: IngestionEvent) => Promise<ExternalCommunitySourceEvent | null>,
    options?: IngestionRecoveryOptions
  ): Promise<IngestionRecoverySummary>;

  /**
   * Explicitly replay a single specific ingestion event by its internal ID.
   */
  replayEvent(
    eventId: string,
    eventReconstructor: (event: IngestionEvent) => Promise<ExternalCommunitySourceEvent | null>,
    options?: { maxRetries?: number }
  ): Promise<{ success: boolean; event: IngestionEvent; error?: string }>;
}
