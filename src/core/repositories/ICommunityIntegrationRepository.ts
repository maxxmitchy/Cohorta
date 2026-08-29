import { CommunityIntegration, IntegrationProviderType } from '../domain/integration';

export interface ICommunityIntegrationRepository {
  /**
   * Find a community integration by provider and external provider community ID (e.g. Telegram chat ID).
   */
  findByProviderCommunityId(
    provider: IntegrationProviderType | string,
    providerCommunityId: string
  ): Promise<CommunityIntegration | null>;

  /**
   * Find integrations by internal Cohorta community ID.
   */
  findByCommunityId(communityId: string): Promise<CommunityIntegration[]>;

  /**
   * Save or update an integration.
   */
  saveIntegration(integration: CommunityIntegration): Promise<void>;

  /**
   * Update the reconciliation checkpoint for an integration.
   */
  updateCheckpoint(
    provider: IntegrationProviderType | string,
    providerCommunityId: string,
    checkpoint: string | number
  ): Promise<void>;

  /**
   * Enable or disable an integration.
   */
  setIntegrationActive(
    provider: IntegrationProviderType | string,
    providerCommunityId: string,
    isActive: boolean
  ): Promise<void>;

  /**
   * Delete an integration.
   */
  deleteIntegration(
    provider: IntegrationProviderType | string,
    providerCommunityId: string
  ): Promise<boolean>;

  /**
   * Return all active integrations.
   */
  getAllIntegrations(): Promise<CommunityIntegration[]>;

  /**
   * Clear all records (testing utility).
   */
  clear(): Promise<void>;
}

