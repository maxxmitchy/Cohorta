import * as path from 'path';
import { ICommunityIntegrationRepository } from '../../../core/repositories/ICommunityIntegrationRepository';
import { CommunityIntegration, IntegrationProviderType } from '../../../core/domain/integration';
import { DurableFileStorage } from './DurableFileStorage';

export interface IntegrationStorageModel {
  integrations: Record<string, CommunityIntegration>; // key: `${providerType}:${providerCommunityId}`
}

export class DurableFileCommunityIntegrationRepository implements ICommunityIntegrationRepository {
  private readonly storage: DurableFileStorage<IntegrationStorageModel>;

  constructor(filePath?: string, defaultIntegrations: CommunityIntegration[] = []) {
    const targetPath = filePath || path.join(process.cwd(), '.data', 'community_integrations.json');
    this.storage = new DurableFileStorage<IntegrationStorageModel>(
      targetPath,
      () => {
        const map: Record<string, CommunityIntegration> = {};
        for (const item of defaultIntegrations) {
          map[`${item.providerType}:${item.providerCommunityId}`] = item;
        }
        return { integrations: map };
      }
    );
  }

  async findByProviderCommunityId(
    provider: IntegrationProviderType | string,
    providerCommunityId: string
  ): Promise<CommunityIntegration | null> {
    const data = await this.storage.read();
    const key = `${provider}:${providerCommunityId}`;
    const found = data.integrations[key];
    return found ? { ...found } : null;
  }

  async findByCommunityId(communityId: string): Promise<CommunityIntegration[]> {
    const data = await this.storage.read();
    return Object.values(data.integrations)
      .filter((i) => i.communityId === communityId)
      .map((i) => ({ ...i }));
  }

  async saveIntegration(integration: CommunityIntegration): Promise<void> {
    const key = `${integration.providerType}:${integration.providerCommunityId}`;
    await this.storage.mutate((data) => {
      data.integrations[key] = { ...integration };
    });
  }

  async updateCheckpoint(
    provider: IntegrationProviderType | string,
    providerCommunityId: string,
    checkpoint: string | number
  ): Promise<void> {
    const key = `${provider}:${providerCommunityId}`;
    await this.storage.mutate((data) => {
      if (data.integrations[key]) {
        data.integrations[key].lastCheckpoint = checkpoint;
      }
    });
  }

  async setIntegrationActive(
    provider: IntegrationProviderType | string,
    providerCommunityId: string,
    isActive: boolean
  ): Promise<void> {
    const key = `${provider}:${providerCommunityId}`;
    await this.storage.mutate((data) => {
      if (data.integrations[key]) {
        data.integrations[key].isActive = isActive;
        data.integrations[key].updatedAt = new Date();
      }
    });
  }

  async deleteIntegration(
    provider: IntegrationProviderType | string,
    providerCommunityId: string
  ): Promise<boolean> {
    const key = `${provider}:${providerCommunityId}`;
    return this.storage.mutate((data) => {
      if (data.integrations[key]) {
        delete data.integrations[key];
        return true;
      }
      return false;
    });
  }

  async getAllIntegrations(): Promise<CommunityIntegration[]> {
    const data = await this.storage.read();
    return Object.values(data.integrations).map((i) => ({ ...i }));
  }

  async clear(): Promise<void> {
    await this.storage.mutate((data) => {
      data.integrations = {};
    });
  }
}
