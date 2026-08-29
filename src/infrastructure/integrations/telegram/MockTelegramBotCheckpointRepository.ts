import {
  ITelegramBotCheckpointRepository,
  TelegramBotCheckpoint,
} from './ITelegramBotCheckpointRepository';

export class MockTelegramBotCheckpointRepository implements ITelegramBotCheckpointRepository {
  private readonly checkpoints = new Map<string, TelegramBotCheckpoint>();

  constructor(initialCheckpoints?: TelegramBotCheckpoint[]) {
    if (initialCheckpoints) {
      for (const cp of initialCheckpoints) {
        this.checkpoints.set(cp.botId, { ...cp });
      }
    }
  }

  async getCheckpoint(botId: string = 'default_bot'): Promise<TelegramBotCheckpoint | null> {
    const cp = this.checkpoints.get(botId);
    return cp ? { ...cp } : null;
  }

  async saveCheckpoint(botId: string, lastContiguousUpdateId: number): Promise<TelegramBotCheckpoint> {
    const record: TelegramBotCheckpoint = {
      botId,
      lastContiguousUpdateId,
      updatedAt: new Date(),
    };
    this.checkpoints.set(botId, { ...record });
    return record;
  }

  async clear(): Promise<void> {
    this.checkpoints.clear();
  }
}
