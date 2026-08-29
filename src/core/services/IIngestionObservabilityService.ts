export interface IntegrationOperationalSummary {
  providerType: string;
  providerCommunityId: string;
  communityId: string;
  isActive: boolean;
  lastSuccessfulIngestionAt?: Date;
  lastFailedIngestionAt?: Date;
  lastProcessingError?: string;
  lastCheckpoint?: string | number;
}

export interface DeadLetterEventSummary {
  id: string;
  provider: string;
  externalCommunityId: string;
  externalEventId: string;
  receivedAt: Date;
  lastAttemptAt?: Date;
  permanentlyFailedAt?: Date;
  retryCount: number;
  error?: string;
}

export interface IngestionHealthReport {
  status: 'healthy' | 'degraded' | 'unhealthy';
  totalEvents: number;
  processedCount: number;
  inFlightCount: number;
  staleCount: number;
  failedCount: number;
  permanentlyFailedCount: number;
  activeIntegrationsCount: number;
  integrations: IntegrationOperationalSummary[];
  recentDeadLetterEvents: DeadLetterEventSummary[];
  generatedAt: Date;
}

/**
 * Service for inspecting ingestion pipeline operational health, metrics, and dead-letter records.
 *
 * Requirements:
 * 1. Strict zero-secret-leakage guarantee (no tokens, hashes, or credentials).
 * 2. Real-time read model aggregated from durable storage.
 * 3. Clear differentiation between in-flight, transient failures, and permanent dead-letter states.
 */
export interface IIngestionObservabilityService {
  /**
   * Generates a complete operational health snapshot of the ingestion pipeline.
   */
  getHealthReport(options?: { staleTimeoutMs?: number }): Promise<IngestionHealthReport>;

  /**
   * Retrieves dead-lettered events for review and manual replay.
   */
  getDeadLetterEvents(options?: { provider?: string; limit?: number }): Promise<DeadLetterEventSummary[]>;

  /**
   * Retrieves status of all configured community integrations.
   */
  getIntegrationSummaries(): Promise<IntegrationOperationalSummary[]>;
}
