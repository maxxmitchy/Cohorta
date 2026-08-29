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

export interface ReplayEventOptions {
  /** If true, permits manual replay of permanently_failed / dead-lettered events */
  allowPermanentlyFailed?: boolean;
  /** Alias for allowPermanentlyFailed */
  forceReplayPermanentlyFailed?: boolean;
  /** Human-readable reason or audit note for the replay action */
  reason?: string;
  /** Maximum retries */
  maxRetries?: number;
}

export interface ReplayEventResult {
  success: boolean;
  outcome: 'processed' | 'duplicate_ignored' | 'in_flight' | 'failed' | 'permanently_failed' | 'rejected';
  event: IngestionEvent;
  error?: string;
  message?: string;
}

/**
 * Service for recovering failed, stale, and dead-lettered ingestion events.
 *
 * Requirements:
 * 1. Honors retry count ceilings and dead-letter boundaries (permanently_failed).
 * 2. Re-routes all reprocessing strictly through canonical ICommunityEventIngestionService.
 * 3. Never creates duplicate discussions, replies, or history logs.
 * 4. Stale workers are fenced off via ownerToken verification.
 * 5. Deterministic manual replay semantics for all lifecycle states.
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
   * Explicitly and deterministically replay a single specific ingestion event by its internal ID.
   */
  replayEvent(
    eventId: string,
    eventReconstructor: (event: IngestionEvent) => Promise<ExternalCommunitySourceEvent | null>,
    options?: ReplayEventOptions
  ): Promise<ReplayEventResult>;
}
