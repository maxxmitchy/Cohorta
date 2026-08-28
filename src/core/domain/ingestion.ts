export type IngestionStatus = 'received' | 'processing' | 'processed' | 'failed';

export interface IngestionEvent {
  /** Internal unique ID for this ingestion record */
  id: string;
  /** Provider identifier (e.g. 'telegram', 'discord', 'slack', 'native') */
  provider: string;
  /** External community identifier (e.g. chat ID, guild ID) */
  externalCommunityId: string;
  /** External event identifier (e.g. update ID, message event ID) */
  externalEventId: string;
  /** Provider-scoped unique event key `${provider}:${externalCommunityId}:${externalEventId}` */
  eventKey: string;
  /** Timestamp when the event was first received by Cohorta */
  receivedAt: Date;
  /** Timestamp when processing was finalized */
  processedAt?: Date;
  /** Timestamp when the current/last processing attempt began */
  lastAttemptAt?: Date;
  /** Explicit ownership/attempt token to prevent stale processors from committing after recovery */
  ownerToken?: string;
  /** Explicit processing state */
  status: IngestionStatus;
  /** Detailed error message if status is 'failed' */
  error?: string;
  /** Number of times this event has been attempted */
  retryCount: number;
}
