import * as path from 'path';
import {
  ITelegramBotCheckpointRepository,
  TelegramBotCheckpoint,
} from './ITelegramBotCheckpointRepository';
import { DurableFileStorage } from '../../db/durable/DurableFileStorage';

export interface TelegramCheckpointStorageModel {
  checkpoints: Record<string, TelegramBotCheckpoint>;
}

export class DurableFileTelegramBotCheckpointRepository implements ITelegramBotCheckpointRepository {
  private readonly storage: DurableFileStorage<TelegramCheckpointStorageModel>;

  constructor(filePath?: string) {
    const targetPath = filePath || path.join(process.cwd(), '.data', 'telegram_bot_checkpoints.json');
    this.storage = new DurableFileStorage<TelegramCheckpointStorageModel>(
      targetPath,
      () => ({ checkpoints: {} })
    );
  }

  async getCheckpoint(botId: string = 'default_bot'): Promise<TelegramBotCheckpoint | null> {
    const data = await this.storage.read();
    const cp = data.checkpoints[botId];
    return cp ? { ...cp } : null;
  }

  async saveCheckpoint(botId: string, lastContiguousUpdateId: number): Promise<TelegramBotCheckpoint> {
    const record: TelegramBotCheckpoint = {
      botId,
      lastContiguousUpdateId,
      updatedAt: new Date(),
    };

    await this.storage.mutate((data) => {
      data.checkpoints[botId] = record;
    });

    return record;
  }

  async clear(): Promise<void> {
    await this.storage.mutate((data) => {
      data.checkpoints = {};
    });
  }
}
