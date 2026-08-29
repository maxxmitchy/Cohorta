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

  async updateCheckpoint(
    provider: IntegrationProviderType | string,
    providerCommunityId: string,
    checkpoint: string | number
  ): Promise<void> {
    const key = `${provider}:${providerCommunityId}`;
    const existing = this.integrations.get(key);
    if (existing) {
      existing.lastCheckpoint = checkpoint;
      this.integrations.set(key, { ...existing });
    }
  }

  async setIntegrationActive(
    provider: IntegrationProviderType | string,
    providerCommunityId: string,
    isActive: boolean
  ): Promise<void> {
    const key = `${provider}:${providerCommunityId}`;
    const existing = this.integrations.get(key);
    if (existing) {
      existing.isActive = isActive;
      this.integrations.set(key, { ...existing });
    }
  }

  async deleteIntegration(
    provider: IntegrationProviderType | string,
    providerCommunityId: string
  ): Promise<boolean> {
    const key = `${provider}:${providerCommunityId}`;
    return this.integrations.delete(key);
  }

  async getAllIntegrations(): Promise<CommunityIntegration[]> {
    return Array.from(this.integrations.values()).map((i) => ({ ...i }));
  }

  async clear(): Promise<void> {
    this.integrations.clear();
  }
}
