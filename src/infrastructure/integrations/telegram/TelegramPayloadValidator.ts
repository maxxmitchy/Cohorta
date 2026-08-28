import { TelegramUpdate, TelegramMessage, TelegramChat, TelegramUser, TelegramMessageEntity } from './TelegramTypes';

export type TelegramPayloadValidationResult =
  | {
      isValid: true;
      isSupported: boolean;
      update: TelegramUpdate;
    }
  | {
      isValid: false;
      error: string;
    };

/**
 * Validates untrusted incoming HTTP payloads to confirm structural compliance
 * with the Telegram Bot API schema before passing into TelegramSourceAdapter.
 *
 * Hard Invariants:
 * 1. Never blindly casts untrusted input (no `body as TelegramUpdate`).
 * 2. Never fabricates missing fields or invents dummy messages.
 * 3. Distinguishes between structurally invalid updates (400 Bad Request)
 *    and valid-but-unsupported updates (200 OK Ignored).
 */
export function validateTelegramWebhookPayload(payload: unknown): TelegramPayloadValidationResult {
  if (payload === null || payload === undefined || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      isValid: false,
      error: 'Invalid payload: Request body must be a non-null JSON object.',
    };
  }

  const raw = payload as Record<string, unknown>;

  // 1. update_id is mandatory and must be a valid integer
  if (typeof raw.update_id !== 'number' || !Number.isInteger(raw.update_id)) {
    return {
      isValid: false,
      error: 'Invalid payload: update_id must be a valid integer.',
    };
  }

  const updateId = raw.update_id;

  // 2. Inspect known message containers
  const hasMessage = 'message' in raw && raw.message !== undefined;
  const hasEditedMessage = 'edited_message' in raw && raw.edited_message !== undefined;
  const hasChannelPost = 'channel_post' in raw && raw.channel_post !== undefined;
  const hasEditedChannelPost = 'edited_channel_post' in raw && raw.edited_channel_post !== undefined;

  let validatedMessage: TelegramMessage | undefined;
  let validatedEditedMessage: TelegramMessage | undefined;
  let validatedChannelPost: TelegramMessage | undefined;
  let validatedEditedChannelPost: TelegramMessage | undefined;

  if (hasMessage) {
    const msgResult = validateTelegramMessage(raw.message, 'message');
    if (msgResult.isValid === false) {
      return { isValid: false, error: msgResult.error };
    }
    validatedMessage = msgResult.message;
  }

  if (hasEditedMessage) {
    const msgResult = validateTelegramMessage(raw.edited_message, 'edited_message');
    if (msgResult.isValid === false) {
      return { isValid: false, error: msgResult.error };
    }
    validatedEditedMessage = msgResult.message;
  }

  if (hasChannelPost) {
    const msgResult = validateTelegramMessage(raw.channel_post, 'channel_post');
    if (msgResult.isValid === false) {
      return { isValid: false, error: msgResult.error };
    }
    validatedChannelPost = msgResult.message;
  }

  if (hasEditedChannelPost) {
    const msgResult = validateTelegramMessage(raw.edited_channel_post, 'edited_channel_post');
    if (msgResult.isValid === false) {
      return { isValid: false, error: msgResult.error };
    }
    validatedEditedChannelPost = msgResult.message;
  }

  const isSupported = Boolean(
    validatedMessage || validatedEditedMessage || validatedChannelPost || validatedEditedChannelPost
  );

  // Check if update is a known non-message Telegram update type (e.g. callback_query, inline_query, poll, my_chat_member, etc.)
  const knownOtherTelegramFields = [
    'inline_query',
    'chosen_inline_result',
    'callback_query',
    'shipping_query',
    'pre_checkout_query',
    'poll',
    'poll_answer',
    'my_chat_member',
    'chat_member',
    'chat_join_request',
    'chat_boost',
    'removed_chat_boost',
  ];

  const hasOtherKnownTelegramField = knownOtherTelegramFields.some(field => field in raw && raw[field] !== undefined);

  if (!isSupported && !hasOtherKnownTelegramField) {
    // If it has only update_id and no recognizable Telegram fields, it is structurally invalid
    const keys = Object.keys(raw).filter(k => k !== 'update_id');
    if (keys.length === 0) {
      return {
        isValid: false,
        error: 'Invalid payload: update contains no recognizable Telegram update fields.',
      };
    }
  }

  const update: TelegramUpdate = {
    update_id: updateId,
    ...(validatedMessage ? { message: validatedMessage } : {}),
    ...(validatedEditedMessage ? { edited_message: validatedEditedMessage } : {}),
    ...(validatedChannelPost ? { channel_post: validatedChannelPost } : {}),
    ...(validatedEditedChannelPost ? { edited_channel_post: validatedEditedChannelPost } : {}),
  };

  return {
    isValid: true,
    isSupported,
    update,
  };
}

function validateTelegramMessage(
  raw: unknown,
  fieldName: string,
  depth = 0
): { isValid: true; message: TelegramMessage } | { isValid: false; error: string } {
  if (raw === null || raw === undefined || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      isValid: false,
      error: `Invalid payload: ${fieldName} must be a JSON object.`,
    };
  }

  if (depth > 5) {
    return {
      isValid: false,
      error: `Invalid payload: ${fieldName} exceeds maximum reply nesting depth.`,
    };
  }

  const obj = raw as Record<string, unknown>;

  // message_id
  if (typeof obj.message_id !== 'number' || !Number.isInteger(obj.message_id)) {
    return {
      isValid: false,
      error: `Invalid payload: ${fieldName}.message_id must be a valid integer.`,
    };
  }

  // date
  if (typeof obj.date !== 'number' || !Number.isInteger(obj.date)) {
    return {
      isValid: false,
      error: `Invalid payload: ${fieldName}.date must be a valid unix timestamp integer.`,
    };
  }

  // chat
  if (obj.chat === null || obj.chat === undefined || typeof obj.chat !== 'object' || Array.isArray(obj.chat)) {
    return {
      isValid: false,
      error: `Invalid payload: ${fieldName}.chat must be a valid object.`,
    };
  }

  const rawChat = obj.chat as Record<string, unknown>;
  if (typeof rawChat.id !== 'number' || !Number.isInteger(rawChat.id)) {
    return {
      isValid: false,
      error: `Invalid payload: ${fieldName}.chat.id must be a valid integer.`,
    };
  }

  if (typeof rawChat.type !== 'string' || !['private', 'group', 'supergroup', 'channel'].includes(rawChat.type)) {
    return {
      isValid: false,
      error: `Invalid payload: ${fieldName}.chat.type must be one of 'private', 'group', 'supergroup', 'channel'.`,
    };
  }

  const chat: TelegramChat = {
    id: rawChat.id,
    type: rawChat.type as TelegramChat['type'],
    title: typeof rawChat.title === 'string' ? rawChat.title : undefined,
    username: typeof rawChat.username === 'string' ? rawChat.username : undefined,
    first_name: typeof rawChat.first_name === 'string' ? rawChat.first_name : undefined,
    last_name: typeof rawChat.last_name === 'string' ? rawChat.last_name : undefined,
  };

  // from (optional)
  let from: TelegramUser | undefined;
  if (obj.from !== undefined) {
    if (obj.from === null || typeof obj.from !== 'object' || Array.isArray(obj.from)) {
      return {
        isValid: false,
        error: `Invalid payload: ${fieldName}.from must be an object when present.`,
      };
    }
    const rawFrom = obj.from as Record<string, unknown>;
    if (typeof rawFrom.id !== 'number' || !Number.isInteger(rawFrom.id)) {
      return {
        isValid: false,
        error: `Invalid payload: ${fieldName}.from.id must be an integer.`,
      };
    }
    if (typeof rawFrom.is_bot !== 'boolean') {
      return {
        isValid: false,
        error: `Invalid payload: ${fieldName}.from.is_bot must be a boolean.`,
      };
    }
    if (typeof rawFrom.first_name !== 'string') {
      return {
        isValid: false,
        error: `Invalid payload: ${fieldName}.from.first_name must be a string.`,
      };
    }
    from = {
      id: rawFrom.id,
      is_bot: rawFrom.is_bot,
      first_name: rawFrom.first_name,
      last_name: typeof rawFrom.last_name === 'string' ? rawFrom.last_name : undefined,
      username: typeof rawFrom.username === 'string' ? rawFrom.username : undefined,
      language_code: typeof rawFrom.language_code === 'string' ? rawFrom.language_code : undefined,
    };
  }

  // reply_to_message (optional)
  let replyToMessage: TelegramMessage | undefined;
  if (obj.reply_to_message !== undefined && obj.reply_to_message !== null) {
    const replyResult = validateTelegramMessage(obj.reply_to_message, `${fieldName}.reply_to_message`, depth + 1);
    if (!replyResult.isValid) {
      return replyResult;
    }
    replyToMessage = replyResult.message;
  }

  // entities & caption_entities (optional)
  const entities = validateEntities(obj.entities, `${fieldName}.entities`);
  if (entities === null) {
    return { isValid: false, error: `Invalid payload: ${fieldName}.entities is malformed.` };
  }

  const captionEntities = validateEntities(obj.caption_entities, `${fieldName}.caption_entities`);
  if (captionEntities === null) {
    return { isValid: false, error: `Invalid payload: ${fieldName}.caption_entities is malformed.` };
  }

  const message: TelegramMessage = {
    message_id: obj.message_id,
    date: obj.date,
    chat,
    from,
    message_thread_id: typeof obj.message_thread_id === 'number' ? obj.message_thread_id : undefined,
    text: typeof obj.text === 'string' ? obj.text : undefined,
    caption: typeof obj.caption === 'string' ? obj.caption : undefined,
    reply_to_message: replyToMessage,
    edit_date: typeof obj.edit_date === 'number' ? obj.edit_date : undefined,
    entities: entities !== undefined ? entities : undefined,
    caption_entities: captionEntities !== undefined ? captionEntities : undefined,
    photo: Array.isArray(obj.photo) ? (obj.photo as TelegramMessage['photo']) : undefined,
    sticker: typeof obj.sticker === 'object' && obj.sticker !== null ? (obj.sticker as TelegramMessage['sticker']) : undefined,
    document: typeof obj.document === 'object' && obj.document !== null ? (obj.document as TelegramMessage['document']) : undefined,
    video: typeof obj.video === 'object' && obj.video !== null ? (obj.video as TelegramMessage['video']) : undefined,
    voice: typeof obj.voice === 'object' && obj.voice !== null ? (obj.voice as TelegramMessage['voice']) : undefined,
  };

  return {
    isValid: true,
    message,
  };
}

function validateEntities(raw: unknown, fieldName: string): TelegramMessageEntity[] | undefined | null {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (!Array.isArray(raw)) {
    return null;
  }
  const result: TelegramMessageEntity[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) return null;
    const e = item as Record<string, unknown>;
    if (typeof e.type !== 'string' || typeof e.offset !== 'number' || typeof e.length !== 'number') {
      return null;
    }
    result.push({
      type: e.type,
      offset: e.offset,
      length: e.length,
      url: typeof e.url === 'string' ? e.url : undefined,
    });
  }
  return result;
}
