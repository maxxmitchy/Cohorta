import { CommunityIntegration, IntegrationProviderType } from '../domain/integration';
import { ICommunityIntegrationRepository } from '../repositories/ICommunityIntegrationRepository';
import { ICommunityRepository } from '../repositories/ICommunityRepository';
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
    private readonly communityRepo?: ICommunityRepository,
    sanitizer?: ISecretSanitizer
  ) {
    this.sanitizer = sanitizer || new SecretSanitizer();
  }

  async createIntegration(params: CreateIntegrationParams): Promise<CommunityIntegration> {
    const rawProvider = typeof params.providerType === 'string' ? params.providerType.trim() : '';
    const rawProviderCommunityId = typeof params.providerCommunityId === 'string' ? params.providerCommunityId.trim() : '';
    const rawCommunityId = typeof params.communityId === 'string' ? params.communityId.trim() : '';

    if (!rawProvider || !['telegram', 'discord', 'slack', 'native'].includes(rawProvider)) {
      throw new InvalidIntegrationError(`Invalid or unsupported provider type: '${params.providerType}'`);
    }
    const provider = rawProvider as IntegrationProviderType;

    if (!rawProviderCommunityId) {
      throw new InvalidIntegrationError('providerCommunityId (e.g. external chat ID) must be provided.');
    }

    if (rawProviderCommunityId.length > 128) {
      throw new InvalidIntegrationError('providerCommunityId cannot exceed 128 characters.');
    }

    // Reject control characters
    // eslint-disable-next-line no-control-regex
    if (/[\x00-\x1F\x7F]/.test(rawProviderCommunityId)) {
      throw new InvalidIntegrationError('providerCommunityId contains invalid control characters.');
    }

    if (!rawCommunityId) {
      throw new InvalidIntegrationError('communityId must be provided.');
    }

    if (rawCommunityId.length > 128) {
      throw new InvalidIntegrationError('communityId cannot exceed 128 characters.');
    }

    // eslint-disable-next-line no-control-regex
    if (/[\x00-\x1F\x7F]/.test(rawCommunityId)) {
      throw new InvalidIntegrationError('communityId contains invalid control characters.');
    }

    // Validate that the Cohorta community actually exists if communityRepo is provided
    if (this.communityRepo) {
      const community = await this.communityRepo.getCommunityById(rawCommunityId);
      if (!community) {
        throw new InvalidIntegrationError(`Cohorta community '${rawCommunityId}' does not exist.`);
      }
    }

    // Enforce 1:1 uniqueness invariant
    const existing = await this.integrationRepo.findByProviderCommunityId(provider, rawProviderCommunityId);
    if (existing) {
      if (existing.communityId !== rawCommunityId) {
        throw new IntegrationConflictError(
          `External community ${provider}:${rawProviderCommunityId} is already mapped to Cohorta community '${existing.communityId}'. Cannot remap to '${rawCommunityId}'.`
        );
      }
      throw new IntegrationConflictError(
        `An integration for ${provider}:${rawProviderCommunityId} already exists on community '${rawCommunityId}'.`
      );
    }

    const sanitizedProviderId = rawProviderCommunityId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const id = `int_${provider}_${sanitizedProviderId}`;
    const now = new Date();

    const newIntegration: CommunityIntegration = {
      id,
      communityId: rawCommunityId,
      providerType: provider,
      providerCommunityId: rawProviderCommunityId,
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
