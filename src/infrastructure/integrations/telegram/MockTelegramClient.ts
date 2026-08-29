import {
  ITelegramClient,
  TelegramUpdate,
  TelegramWebhookInfo,
  TelegramUser,
  SetWebhookParams,
  DeleteWebhookParams,
  FetchUpdatesParams,
} from './ITelegramClient';

export class MockTelegramClient implements ITelegramClient {
  private updates: TelegramUpdate[] = [];
  private deliveredUpdates: TelegramUpdate[] = [];
  private webhookInfo: TelegramWebhookInfo = {
    url: '',
    has_custom_certificate: false,
    pending_update_count: 0,
  };
  private botUser: TelegramUser = {
    id: 123456789,
    is_bot: true,
    first_name: 'CohortaMockBot',
    username: 'cohorta_mock_bot',
  };

  seedUpdates(updates: TelegramUpdate[]): void {
    this.updates = [...updates];
  }

  getDeliveredUpdates(): TelegramUpdate[] {
    return this.deliveredUpdates;
  }

  setWebhookInfoResult(info: Partial<TelegramWebhookInfo>): void {
    this.webhookInfo = {
      url: info.url ?? '',
      has_custom_certificate: info.has_custom_certificate ?? false,
      pending_update_count: info.pending_update_count ?? 0,
      last_error_date: info.last_error_date,
      last_error_message: info.last_error_message,
      max_connections: info.max_connections,
      allowed_updates: info.allowed_updates,
    };
  }

  async setWebhook(params: SetWebhookParams): Promise<boolean> {
    this.webhookInfo.url = params.url;
    return true;
  }

  async getWebhookInfo(): Promise<TelegramWebhookInfo> {
    return { ...this.webhookInfo };
  }

  async deleteWebhook(params?: DeleteWebhookParams): Promise<boolean> {
    this.webhookInfo.url = '';
    return true;
  }

  async fetchUpdates(params?: FetchUpdatesParams): Promise<TelegramUpdate[]> {
    const offset = params?.offset ?? 0;
    const limit = params?.limit ?? 100;

    const matched = this.updates.filter((u) => u.update_id >= offset).slice(0, limit);
    this.deliveredUpdates.push(...matched);
    return matched;
  }

  async getMe(): Promise<TelegramUser> {
    return { ...this.botUser };
  }
}
