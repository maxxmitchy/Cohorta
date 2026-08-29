export type IntegrationProviderType = 'telegram' | 'discord' | 'slack' | 'native';

export interface CommunityIntegration {
  id: string;
  communityId: string;
  providerType: IntegrationProviderType;
  providerCommunityId: string; // e.g., the Telegram Chat ID
  isActive: boolean;
  /**
   * IMPORTANT: metadata must not be an untyped dumping ground in production.
   * A structural validation boundary (e.g., Zod schemas) must be established
   * at the provider implementation level before saving/retrieving to ensure
   * type safety for provider-specific config.
   */
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt?: Date;
  /** Timestamp of the most recent successful event ingestion */
  lastSuccessfulIngestionAt?: Date;
  /** Timestamp of the most recent failed event ingestion attempt */
  lastFailedIngestionAt?: Date;
  /** Operational update/offset checkpoint for provider reconciliation */
  lastCheckpoint?: string | number;
  /** Most recent error message encountered during event ingestion */
  lastProcessingError?: string;
}
