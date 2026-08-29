export interface TelegramReconciliationOptions {
  limit?: number;
  offset?: number;
  timeout?: number;
  allowedUpdates?: string[];
  maxBatches?: number;
}

export interface TelegramReconciliationResult {
  batchesProcessed: number;
  updatesFetched: number;
  eventsIngested: number;
  duplicatesSkipped: number;
  failures: number;
  lastOffsetProcessed?: number;
  checkpointSaved?: number;
}

/**
 * Service for reconciling missed updates via Telegram's getUpdates API.
 *
 * Requirements:
 * 1. Uses explicit checkpoint offset to avoid infinite loops or reprocessing storms.
 * 2. Ingests all adapted events through canonical ICommunityEventIngestionService to enforce deduplication.
 * 3. Updates community integration checkpoint atomically upon completion.
 * 4. Never exposes secrets in logs or responses.
 */
export interface ITelegramReconciliationService {
  /**
   * Reconciles missed updates from Telegram getUpdates API.
   */
  reconcileUpdates(
    options?: TelegramReconciliationOptions
  ): Promise<TelegramReconciliationResult>;
}
