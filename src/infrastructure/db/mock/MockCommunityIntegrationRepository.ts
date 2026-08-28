import { ICommunityIntegrationRepository } from '../../../core/repositories/ICommunityIntegrationRepository';
import { CommunityIntegration, IntegrationProviderType } from '../../../core/domain/integration';

export class MockCommunityIntegrationRepository implements ICommunityIntegrationRepository {
  private integrations: Map<string, CommunityIntegration> = new Map();

  constructor(initialIntegrations: CommunityIntegration[] = []) {
    for (const integration of initialIntegrations) {
      const key = `${integration.providerType}:${integration.providerCommunityId}`;
      this.integrations.set(key, { ...integration });
    }
  }

  async findByProviderCommunityId(
    provider: IntegrationProviderType | string,
    providerCommunityId: string
  ): Promise<CommunityIntegration | null> {
    const key = `${provider}:${providerCommunityId}`;
    const found = this.integrations.get(key);
    return found ? { ...found } : null;
  }

  async findByCommunityId(communityId: string): Promise<CommunityIntegration[]> {
    return Array.from(this.integrations.values())
      .filter((i) => i.communityId === communityId)
      .map((i) => ({ ...i }));
  }

  async saveIntegration(integration: CommunityIntegration): Promise<void> {
    const key = `${integration.providerType}:${integration.providerCommunityId}`;
    this.integrations.set(key, { ...integration });
  }

  async getAllIntegrations(): Promise<CommunityIntegration[]> {
    return Array.from(this.integrations.values()).map((i) => ({ ...i }));
  }

  async clear(): Promise<void> {
    this.integrations.clear();
  }
}
