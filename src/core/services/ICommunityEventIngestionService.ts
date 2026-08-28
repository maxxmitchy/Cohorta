import { ExternalCommunitySourceEvent } from '../source/ExternalCommunitySourceEvent';
import { IngestionEvent } from '../domain/ingestion';
import { Discussion } from '../domain/discussion';

export type IngestionOutcome = 'processed' | 'duplicate_ignored' | 'failed' | 'ignored';

export interface SingleEventIngestionResult {
  outcome: IngestionOutcome;
  eventKey: string;
  externalEventId: string;
  ingestionRecord?: IngestionEvent;
  discussionsAffected?: Discussion[];
  error?: string;
}

export interface IngestionBatchResult {
  totalReceived: number;
  processedCount: number;
  duplicateCount: number;
  failedCount: number;
  results: SingleEventIngestionResult[];
}

export interface ICommunityEventIngestionService {
  /**
   * Ingests a single external source event idempotently and durably into Cohorta.
   *
   * 1. Checks provider-scoped idempotency via IIngestionEventRepository.
   * 2. If already processed -> returns duplicate_ignored outcome without duplicate history.
   * 3. If failed previously or new -> sets status to processing.
   * 4. Resolves community integration mapping.
   * 5. Applies message lifecycle (create, edit, reply, delete, out-of-order reply reconciliation).
   * 6. Persists updated Discussions to ICommunityHistoryRepository.
   * 7. Finalizes ingestion record status to processed (or failed on error).
   */
  ingestEvent(event: ExternalCommunitySourceEvent): Promise<SingleEventIngestionResult>;

  /**
   * Ingests a batch of external source events in order, maintaining idempotency and history integrity.
   */
  ingestBatch(events: ExternalCommunitySourceEvent[]): Promise<IngestionBatchResult>;
}
