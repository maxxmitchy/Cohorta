import { TelegramUpdate } from './TelegramTypes';

export const TEST_TELEGRAM_CHAT_ID = -5456731754;
export const TEST_CHAT_ID_STRING = '-5456731754';
export const UNAUTHORIZED_CHAT_ID = -9999999999;

/**
 * Fixture A: Normal introductory test message
 * message_id: 3
 * "Cohorta integration test 001"
 */
export const FIXTURE_TELEGRAM_UPDATE_001: TelegramUpdate = {
  update_id: 10001,
  message: {
    message_id: 3,
    from: {
      id: 700101,
      is_bot: false,
      first_name: 'Alex',
      last_name: 'Rivera',
      username: 'alex_r',
    },
    chat: {
      id: TEST_TELEGRAM_CHAT_ID,
      type: 'group',
      title: 'Cohorta AI Test Group',
    },
    date: 1708900000, // 2024-02-25T22:26:40.000Z
    text: 'Cohorta integration test 001',
  },
};

/**
 * Fixture B: Question inquiry message
 * message_id: 4
 * "Can someone explain how AI agents use memory?"
 */
export const FIXTURE_TELEGRAM_UPDATE_002_QUESTION: TelegramUpdate = {
  update_id: 10002,
  message: {
    message_id: 4,
    from: {
      id: 700102,
      is_bot: false,
      first_name: 'Elena',
      last_name: 'Rostova',
      username: 'elena_dev',
    },
    chat: {
      id: TEST_TELEGRAM_CHAT_ID,
      type: 'group',
      title: 'Cohorta AI Test Group',
    },
    date: 1708900060, // 2024-02-25T22:27:40.000Z
    text: 'Can someone explain how AI agents use memory?',
  },
};

/**
 * Fixture C: Reply message referencing message 4
 * message_id: 5
 * "I think persistent memory is important for maintaining context."
 * reply_to_message.message_id = 4
 */
export const FIXTURE_TELEGRAM_UPDATE_003_REPLY: TelegramUpdate = {
  update_id: 10003,
  message: {
    message_id: 5,
    from: {
      id: 700103,
      is_bot: false,
      first_name: 'Marcus',
      last_name: 'Vance',
      username: 'marcus_v',
    },
    chat: {
      id: TEST_TELEGRAM_CHAT_ID,
      type: 'group',
      title: 'Cohorta AI Test Group',
    },
    date: 1708900120, // 2024-02-25T22:28:40.000Z
    text: 'I think persistent memory is important for maintaining context.',
    reply_to_message: {
      message_id: 4,
      from: {
        id: 700102,
        is_bot: false,
        first_name: 'Elena',
        last_name: 'Rostova',
        username: 'elena_dev',
      },
      chat: {
        id: TEST_TELEGRAM_CHAT_ID,
        type: 'group',
        title: 'Cohorta AI Test Group',
      },
      date: 1708900060,
      text: 'Can someone explain how AI agents use memory?',
    },
  },
};

/**
 * Fixture D: Private /start command message
 * chat.type: 'private'
 */
export const FIXTURE_TELEGRAM_UPDATE_PRIVATE_START: TelegramUpdate = {
  update_id: 10000,
  message: {
    message_id: 1,
    from: {
      id: 700101,
      is_bot: false,
      first_name: 'Alex',
      last_name: 'Rivera',
      username: 'alex_r',
    },
    chat: {
      id: 700101,
      type: 'private',
      first_name: 'Alex',
      last_name: 'Rivera',
      username: 'alex_r',
    },
    date: 1708899000,
    text: '/start',
    entities: [
      {
        type: 'bot_command',
        offset: 0,
        length: 6,
      },
    ],
  },
};

/**
 * Fixture E: Message from an unauthorized Telegram chat
 * chat.id: -9999999999
 */
export const FIXTURE_TELEGRAM_UPDATE_UNAUTHORIZED: TelegramUpdate = {
  update_id: 10004,
  message: {
    message_id: 99,
    from: {
      id: 888888,
      is_bot: false,
      first_name: 'Stranger',
    },
    chat: {
      id: UNAUTHORIZED_CHAT_ID,
      type: 'group',
      title: 'Spam or External Group',
    },
    date: 1708900200,
    text: 'Unauthorized payload injection test',
  },
};

/**
 * Fixture H: Edited message update
 * edited_message with edit_date
 */
export const FIXTURE_TELEGRAM_UPDATE_EDITED: TelegramUpdate = {
  update_id: 10005,
  edited_message: {
    message_id: 3,
    from: {
      id: 700101,
      is_bot: false,
      first_name: 'Alex',
      last_name: 'Rivera',
      username: 'alex_r',
    },
    chat: {
      id: TEST_TELEGRAM_CHAT_ID,
      type: 'group',
      title: 'Cohorta AI Test Group',
    },
    date: 1708900000,
    edit_date: 1708900300,
    text: 'Cohorta integration test 001 (Updated: verified agent pipeline)',
  },
};

/**
 * Fixture I: Message containing a resource link
 */
export const FIXTURE_TELEGRAM_UPDATE_RESOURCE: TelegramUpdate = {
  update_id: 10006,
  message: {
    message_id: 6,
    from: {
      id: 700101,
      is_bot: false,
      first_name: 'Alex',
      last_name: 'Rivera',
      username: 'alex_r',
    },
    chat: {
      id: TEST_TELEGRAM_CHAT_ID,
      type: 'group',
      title: 'Cohorta AI Test Group',
    },
    date: 1708900400,
    text: 'Here is the seminal paper on cognitive architectures: https://arxiv.org/abs/2305.18290 and our implementation repo: https://github.com/agent-memory/core',
    entities: [
      {
        type: 'url',
        offset: 54,
        length: 32,
      },
      {
        type: 'url',
        offset: 116,
        length: 36,
      },
    ],
  },
};

/**
 * Fixture J: Media update with no text (e.g. sticker / image without caption)
 */
export const FIXTURE_TELEGRAM_UPDATE_STICKER_NO_TEXT: TelegramUpdate = {
  update_id: 10007,
  message: {
    message_id: 7,
    from: {
      id: 700102,
      is_bot: false,
      first_name: 'Elena',
      last_name: 'Rostova',
    },
    chat: {
      id: TEST_TELEGRAM_CHAT_ID,
      type: 'group',
      title: 'Cohorta AI Test Group',
    },
    date: 1708900500,
    sticker: {
      file_id: 'sticker_file_abc123',
      emoji: '👍',
    },
  },
};
