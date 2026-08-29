export interface TelegramBotCheckpoint {
  /** Identifier of the bot or provider bot stream (e.g. 'default_bot' or token prefix) */
  botId: string;
  /** Highest contiguous safely finalized update ID processed by this bot */
  lastContiguousUpdateId: number;
  /** Timestamp when the checkpoint was last updated */
  updatedAt: Date;
}

export interface ITelegramBotCheckpointRepository {
  /**
   * Retrieves the current stream checkpoint for the specified bot.
   */
  getCheckpoint(botId?: string): Promise<TelegramBotCheckpoint | null>;

  /**
   * Atomically saves the highest contiguous safely finalized update ID for the bot.
   */
  saveCheckpoint(botId: string, lastContiguousUpdateId: number): Promise<TelegramBotCheckpoint>;

  /**
   * Resets or clears checkpoints (e.g. for testing or reconfiguration).
   */
  clear(): Promise<void>;
}
