import { CommunityIntegration, IntegrationProviderType } from '../domain/integration';
import { ICommunityIntegrationRepository } from '../repositories/ICommunityIntegrationRepository';
import { ISecretSanitizer, SecretSanitizer } from '../security/SecretSanitizer';
import {
  ICommunityIntegrationService,
  CreateIntegrationParams,
  IntegrationHealthInfo,
  IntegrationNotFoundError,
  IntegrationConflictError,
  InvalidIntegrationError,
} from './ICommunityIntegrationService';

export class CommunityIntegrationService implements ICommunityIntegrationService {
  private readonly sanitizer: ISecretSanitizer;

  constructor(
    private readonly integrationRepo: ICommunityIntegrationRepository,
    sanitizer?: ISecretSanitizer
  ) {
    this.sanitizer = sanitizer || new SecretSanitizer();
  }

  async createIntegration(params: CreateIntegrationParams): Promise<CommunityIntegration> {
    const provider = params.providerType?.trim() as IntegrationProviderType;
    const providerCommunityId = params.providerCommunityId?.trim();
    const communityId = params.communityId?.trim();

    if (!provider || !['telegram', 'discord', 'slack', 'native'].includes(provider)) {
      throw new InvalidIntegrationError(`Invalid or unsupported provider type: '${params.providerType}'`);
    }

    if (!providerCommunityId) {
      throw new InvalidIntegrationError('providerCommunityId (e.g. external chat ID) must be provided.');
    }

    if (!communityId) {
      throw new InvalidIntegrationError('communityId must be provided.');
    }

    // Enforce 1:1 uniqueness invariant
    const existing = await this.integrationRepo.findByProviderCommunityId(provider, providerCommunityId);
    if (existing) {
      if (existing.communityId !== communityId) {
        throw new IntegrationConflictError(
          `External community ${provider}:${providerCommunityId} is already mapped to Cohorta community '${existing.communityId}'. Cannot remap to '${communityId}'.`
        );
      }
      throw new IntegrationConflictError(
        `An integration for ${provider}:${providerCommunityId} already exists on community '${communityId}'.`
      );
    }

    const sanitizedProviderId = providerCommunityId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const id = `int_${provider}_${sanitizedProviderId}`;
    const now = new Date();

    const newIntegration: CommunityIntegration = {
      id,
      communityId,
      providerType: provider,
      providerCommunityId,
      isActive: params.isActive !== undefined ? params.isActive : true,
      metadata: params.metadata ? { ...params.metadata } : {},
      createdAt: now,
      updatedAt: now,
    };

    await this.integrationRepo.saveIntegration(newIntegration);
    return { ...newIntegration };
  }

  async enableIntegration(
    provider: IntegrationProviderType | string,
    providerCommunityId: string
  ): Promise<CommunityIntegration> {
    const pId = providerCommunityId?.trim();
    const existing = await this.integrationRepo.findByProviderCommunityId(provider, pId);
    if (!existing) {
      throw new IntegrationNotFoundError(provider, pId);
    }

    existing.isActive = true;
    existing.updatedAt = new Date();

    await this.integrationRepo.saveIntegration(existing);
    return { ...existing };
  }

  async disableIntegration(
    provider: IntegrationProviderType | string,
    providerCommunityId: string
  ): Promise<CommunityIntegration> {
    const pId = providerCommunityId?.trim();
    const existing = await this.integrationRepo.findByProviderCommunityId(provider, pId);
    if (!existing) {
      throw new IntegrationNotFoundError(provider, pId);
    }

    existing.isActive = false;
    existing.updatedAt = new Date();

    await this.integrationRepo.saveIntegration(existing);
    return { ...existing };
  }

  async getIntegration(
    provider: IntegrationProviderType | string,
    providerCommunityId: string
  ): Promise<CommunityIntegration | null> {
    const pId = providerCommunityId?.trim();
    const found = await this.integrationRepo.findByProviderCommunityId(provider, pId);
    return found ? { ...found } : null;
  }

  async listIntegrationsForCommunity(communityId: string): Promise<CommunityIntegration[]> {
    const list = await this.integrationRepo.findByCommunityId(communityId.trim());
    return list.map((item) => ({ ...item }));
  }

  async listAllIntegrations(): Promise<CommunityIntegration[]> {
    const list = await this.integrationRepo.getAllIntegrations();
    return list.map((item) => ({ ...item }));
  }

  async deactivateOrRemoveIntegration(
    provider: IntegrationProviderType | string,
    providerCommunityId: string
  ): Promise<boolean> {
    const pId = providerCommunityId?.trim();
    return this.integrationRepo.deleteIntegration(provider, pId);
  }

  async getIntegrationHealth(
    provider: IntegrationProviderType | string,
    providerCommunityId: string
  ): Promise<IntegrationHealthInfo | null> {
    const pId = providerCommunityId?.trim();
    const integration = await this.integrationRepo.findByProviderCommunityId(provider, pId);
    if (!integration) {
      return null;
    }

    let status: 'healthy' | 'degraded' | 'disabled' | 'inactive' = 'healthy';
    if (!integration.isActive) {
      status = 'disabled';
    } else if (
      integration.lastFailedIngestionAt &&
      (!integration.lastSuccessfulIngestionAt ||
        new Date(integration.lastFailedIngestionAt).getTime() > new Date(integration.lastSuccessfulIngestionAt).getTime())
    ) {
      status = 'degraded';
    }

    return {
      providerType: integration.providerType,
      providerCommunityId: integration.providerCommunityId,
      communityId: integration.communityId,
      isActive: integration.isActive,
      createdAt: integration.createdAt,
      updatedAt: integration.updatedAt,
      lastSuccessfulIngestionAt: integration.lastSuccessfulIngestionAt,
      lastFailedIngestionAt: integration.lastFailedIngestionAt,
      lastProcessingError: integration.lastProcessingError
        ? this.sanitizer.sanitizeString(integration.lastProcessingError)
        : undefined,
      lastCheckpoint: integration.lastCheckpoint,
      status,
    };
  }
}
