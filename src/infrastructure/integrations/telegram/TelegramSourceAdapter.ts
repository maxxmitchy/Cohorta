import {
  ExternalCommunitySourceEvent,
  SourceEventType,
  ExternalAuthorRef,
  ExternalResourceRef,
} from '../../../core/source/ExternalCommunitySourceEvent';
import { TelegramUpdate, TelegramMessage, TelegramMessageEntity } from './TelegramTypes';
import { TelegramConfig } from './TelegramConfig';

/**
 * Pure, deterministic adapter transforming Telegram Bot API updates into
 * provider-neutral ExternalCommunitySourceEvent instances.
 *
 * Invariants:
 * 1. Strictly infrastructure-level; never imported by core domain or UI.
 * 2. Enforces authorized chat boundaries (unauthorized chats are dropped).
 * 3. Enforces private chat isolation (private chats are ignored for community history).
 * 4. Preserves Telegram's native timestamp (date * 1000).
 * 5. Maps update_id to externalEventId and message_id to externalMessageId.
 * 6. Preserves parent message reply relationships without fabricating content.
 */
export class TelegramSourceAdapter {
  /**
   * Adapts a batch of Telegram updates into normalized ExternalCommunitySourceEvent instances.
   * Silently filters out unauthorized chats, private direct messages, and unsupported non-message updates.
   */
  static adaptUpdates(
    updates: TelegramUpdate[],
    config: TelegramConfig
  ): ExternalCommunitySourceEvent[] {
    const events: ExternalCommunitySourceEvent[] = [];

    for (const update of updates) {
      const event = this.adaptUpdate(update, config);
      if (event) {
        events.push(event);
      }
    }

    return events;
  }

  /**
   * Adapts an individual Telegram update.
   * Returns null if the update is from an unauthorized chat, private message, or unhandled update type.
   */
  static adaptUpdate(
    update: TelegramUpdate,
    config: TelegramConfig
  ): ExternalCommunitySourceEvent | null {
    if (!update || typeof update.update_id !== 'number') {
      return null;
    }

    // Determine the active message object and whether it is an edit
    const isEdit = Boolean(update.edited_message || update.edited_channel_post);
    const message: TelegramMessage | undefined =
      update.message ||
      update.edited_message ||
      update.channel_post ||
      update.edited_channel_post;

    if (!message || !message.chat) {
      return null;
    }

    // 1. Private Message Isolation: private chats (e.g. /start) MUST NOT enter community history
    if (message.chat.type === 'private') {
      return null;
    }

    // 2. Authorized Community Boundary: reject chats not in config.authorizedChatIds
    const chatIdStr = String(message.chat.id);
    if (!config.authorizedChatIds.has(chatIdStr)) {
      return null;
    }

    // 3. Determine SourceEventType
    let eventType: SourceEventType = 'message_created';
    if (isEdit) {
      eventType = 'message_edited';
    } else if (message.new_chat_members && message.new_chat_members.length > 0) {
      eventType = 'member_joined';
    } else if (message.left_chat_member) {
      eventType = 'member_left';
    } else if (message.reply_to_message) {
      eventType = 'reply_created';
    }

    // 4. Extract raw content (text or caption, without fabricating placeholder text for uncaptioned media)
    const rawContent = message.text ?? message.caption ?? '';

    // 5. Author Provenance
    const author = this.mapAuthor(message);

    // 6. External Parent ID for replies
    const externalParentMessageId = message.reply_to_message
      ? String(message.reply_to_message.message_id)
      : undefined;

    // 7. Extract Resource References from Telegram entities if present
    const resources = this.extractResources(message.text || message.caption || '', message.entities || message.caption_entities);

    // 8. Construct provider-neutral ExternalCommunitySourceEvent
    const sourceEvent: ExternalCommunitySourceEvent = {
      provider: 'telegram',
      externalEventId: String(update.update_id),
      externalCommunityId: chatIdStr,
      externalMessageId: String(message.message_id),
      externalParentMessageId,
      externalThreadId: message.message_thread_id ? String(message.message_thread_id) : undefined,
      eventType,
      author,
      content: rawContent,
      timestamp: new Date(message.date * 1000),
      sequenceId: update.update_id,
      roadmapItemId: config.defaultRoadmapItemId,
      topicHint: message.chat.title,
      resources: resources.length > 0 ? resources : undefined,
      metadata: {
        isForwarded: Boolean(message.forward_from || message.forward_from_chat),
        forwardedFrom: this.deriveForwardedFrom(message),
        editedAt: message.edit_date ? new Date(message.edit_date * 1000) : undefined,
        telegramChatType: message.chat.type,
      },
    };

    return sourceEvent;
  }

  private static mapAuthor(message: TelegramMessage): ExternalAuthorRef {
    if (message.from) {
      const nameParts = [message.from.first_name, message.from.last_name].filter(Boolean);
      const displayName = nameParts.length > 0
        ? nameParts.join(' ')
        : message.from.username || 'Telegram User';

      return {
        externalUserId: String(message.from.id),
        displayName,
        roleHint: 'member',
      };
    }

    if (message.sender_chat) {
      return {
        externalUserId: String(message.sender_chat.id),
        displayName: message.sender_chat.title || 'Channel',
        roleHint: 'creator',
      };
    }

    return {
      externalUserId: 'unknown_telegram_user',
      displayName: 'Telegram User',
      roleHint: 'member',
    };
  }

  private static deriveForwardedFrom(message: TelegramMessage): string | undefined {
    if (message.forward_from) {
      const nameParts = [message.forward_from.first_name, message.forward_from.last_name].filter(Boolean);
      return nameParts.length > 0 ? nameParts.join(' ') : message.forward_from.username;
    }
    if (message.forward_from_chat) {
      return message.forward_from_chat.title || message.forward_from_chat.username;
    }
    return undefined;
  }

  private static extractResources(
    text: string,
    entities?: TelegramMessageEntity[]
  ): ExternalResourceRef[] {
    const resources: ExternalResourceRef[] = [];
    const seenUrls = new Set<string>();

    if (entities) {
      for (const entity of entities) {
        if (entity.type === 'url') {
          const url = text.substring(entity.offset, entity.offset + entity.length);
          if (url && !seenUrls.has(url)) {
            seenUrls.add(url);
            resources.push({
              url,
              type: this.inferResourceType(url),
            });
          }
        } else if (entity.type === 'text_link' && entity.url) {
          if (!seenUrls.has(entity.url)) {
            seenUrls.add(entity.url);
            const anchorText = text.substring(entity.offset, entity.offset + entity.length);
            resources.push({
              url: entity.url,
              title: anchorText || undefined,
              type: this.inferResourceType(entity.url),
            });
          }
        }
      }
    }

    return resources;
  }

  private static inferResourceType(url: string): 'link' | 'github' | 'paper' | 'guide' {
    const lower = url.toLowerCase();
    if (lower.includes('github.com') || lower.includes('gitlab.com')) {
      return 'github';
    }
    if (lower.includes('arxiv.org') || lower.includes('.pdf') || lower.includes('paper')) {
      return 'paper';
    }
    if (lower.includes('docs.') || lower.includes('guide') || lower.includes('manual')) {
      return 'guide';
    }
    return 'link';
  }
}
