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
   * Return all active integrations.
   */
  getAllIntegrations(): Promise<CommunityIntegration[]>;

  /**
   * Clear all records (testing utility).
   */
  clear(): Promise<void>;
}
