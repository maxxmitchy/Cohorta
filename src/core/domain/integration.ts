export type IntegrationProviderType = 'telegram' | 'discord' | 'slack' | 'native';

export interface CommunityIntegration {
  id: string;
  communityId: string;
  providerType: IntegrationProviderType;
  providerCommunityId: string; // e.g., the Telegram Chat ID
  isActive: boolean;
  metadata: Record<string, unknown>; // Flexible storage for provider-specific config
  createdAt: Date;
}
