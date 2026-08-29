import { CommunityIntegration, IntegrationProviderType } from '../domain/integration';

export interface CreateIntegrationParams {
  providerType: IntegrationProviderType;
  providerCommunityId: string; // e.g. Telegram chat ID
  communityId: string; // Target Cohorta community ID
  isActive?: boolean;
  metadata?: Record<string, unknown>;
}

export interface IntegrationHealthInfo {
  providerType: IntegrationProviderType;
  providerCommunityId: string;
  communityId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt?: Date;
  lastSuccessfulIngestionAt?: Date;
  lastFailedIngestionAt?: Date;
  lastProcessingError?: string;
  lastCheckpoint?: string | number;
  status: 'healthy' | 'degraded' | 'disabled' | 'inactive';
}

export class IntegrationNotFoundError extends Error {
  constructor(provider: string, providerCommunityId: string) {
    super(`Community integration for ${provider}:${providerCommunityId} not found.`);
    this.name = 'IntegrationNotFoundError';
  }
}

export class IntegrationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntegrationConflictError';
  }
}

export class InvalidIntegrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidIntegrationError';
  }
}

/**
 * Provider-Neutral Administrative Service Boundary for Community Integrations.
 *
 * Enforces:
 * 1. 1:1 mapping invariant between external chat and Cohorta community.
 * 2. Strict validation of external identifiers.
 * 3. Administrative activation, deactivation, and lifecycle transitions.
 * 4. Safe removal without deletion of historical normalized community data.
 */
export interface ICommunityIntegrationService {
  createIntegration(params: CreateIntegrationParams): Promise<CommunityIntegration>;
  enableIntegration(provider: IntegrationProviderType | string, providerCommunityId: string): Promise<CommunityIntegration>;
  disableIntegration(provider: IntegrationProviderType | string, providerCommunityId: string): Promise<CommunityIntegration>;
  getIntegration(provider: IntegrationProviderType | string, providerCommunityId: string): Promise<CommunityIntegration | null>;
  listIntegrationsForCommunity(communityId: string): Promise<CommunityIntegration[]>;
  listAllIntegrations(): Promise<CommunityIntegration[]>;
  deactivateOrRemoveIntegration(provider: IntegrationProviderType | string, providerCommunityId: string): Promise<boolean>;
  getIntegrationHealth(provider: IntegrationProviderType | string, providerCommunityId: string): Promise<IntegrationHealthInfo | null>;
}
