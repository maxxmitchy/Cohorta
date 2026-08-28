import { describe, it, expect } from 'vitest';
import { validateTelegramWebhookPayload } from './TelegramPayloadValidator';
import {
  FIXTURE_TELEGRAM_UPDATE_001,
  FIXTURE_TELEGRAM_UPDATE_002_QUESTION,
  FIXTURE_TELEGRAM_UPDATE_003_REPLY,
  FIXTURE_TELEGRAM_UPDATE_EDITED,
  FIXTURE_TELEGRAM_UPDATE_STICKER_NO_TEXT,
} from './TelegramFixtures';

describe('TelegramPayloadValidator', () => {
  describe('Structural Validity', () => {
    it('accepts valid Telegram message update fixture', () => {
      const result = validateTelegramWebhookPayload(FIXTURE_TELEGRAM_UPDATE_001);
      expect(result.isValid).toBe(true);
      if (result.isValid) {
        expect(result.isSupported).toBe(true);
        expect(result.update.update_id).toBe(10001);
        expect(result.update.message?.text).toBe('Cohorta integration test 001');
      }
    });

    it('accepts valid reply message update fixture', () => {
      const result = validateTelegramWebhookPayload(FIXTURE_TELEGRAM_UPDATE_003_REPLY);
      expect(result.isValid).toBe(true);
      if (result.isValid) {
        expect(result.isSupported).toBe(true);
        expect(result.update.message?.reply_to_message?.message_id).toBe(4);
      }
    });

    it('accepts valid edited message update fixture', () => {
      const result = validateTelegramWebhookPayload(FIXTURE_TELEGRAM_UPDATE_EDITED);
      expect(result.isValid).toBe(true);
      if (result.isValid) {
        expect(result.isSupported).toBe(true);
        expect(result.update.edited_message?.edit_date).toBe(1708900300);
      }
    });

    it('accepts valid media message update fixture without fabricating text', () => {
      const result = validateTelegramWebhookPayload(FIXTURE_TELEGRAM_UPDATE_STICKER_NO_TEXT);
      expect(result.isValid).toBe(true);
      if (result.isValid) {
        expect(result.isSupported).toBe(true);
        expect(result.update.message?.sticker?.file_id).toBe('sticker_file_abc123');
        expect(result.update.message?.text).toBeUndefined();
      }
    });

    it('handles valid but unsupported update type (e.g. poll, callback_query) as isValid: true, isSupported: false', () => {
      const pollUpdate = {
        update_id: 99991,
        poll: {
          id: 'poll_123',
          question: 'Do you like AI?',
          options: [{ text: 'Yes', voter_count: 5 }],
          total_voter_count: 5,
          is_closed: false,
        },
      };
      const result = validateTelegramWebhookPayload(pollUpdate);
      expect(result.isValid).toBe(true);
      if (result.isValid) {
        expect(result.isSupported).toBe(false);
        expect(result.update.update_id).toBe(99991);
      }
    });
  });

  describe('Rejection of Malformed / Non-Compliant Payloads', () => {
    it('rejects null payload', () => {
      const result = validateTelegramWebhookPayload(null);
      expect(result.isValid).toBe(false);
      if (result.isValid === false) {
        expect(result.error).toContain('non-null JSON object');
      }
    });

    it('rejects array payload', () => {
      const result = validateTelegramWebhookPayload([FIXTURE_TELEGRAM_UPDATE_001]);
      expect(result.isValid).toBe(false);
      if (result.isValid === false) {
        expect(result.error).toContain('non-null JSON object');
      }
    });

    it('rejects string payload', () => {
      const result = validateTelegramWebhookPayload('{"update_id": 1}');
      expect(result.isValid).toBe(false);
      if (result.isValid === false) {
        expect(result.error).toContain('non-null JSON object');
      }
    });

    it('rejects empty object payload without update_id', () => {
      const result = validateTelegramWebhookPayload({});
      expect(result.isValid).toBe(false);
      if (result.isValid === false) {
        expect(result.error).toContain('update_id must be a valid integer');
      }
    });

    it('rejects update with non-numeric update_id', () => {
      const result = validateTelegramWebhookPayload({ update_id: '10001' });
      expect(result.isValid).toBe(false);
      if (result.isValid === false) {
        expect(result.error).toContain('update_id must be a valid integer');
      }
    });

    it('rejects update with malformed message field (e.g. string instead of object)', () => {
      const result = validateTelegramWebhookPayload({ update_id: 10001, message: 'hello world' });
      expect(result.isValid).toBe(false);
      if (result.isValid === false) {
        expect(result.error).toContain('message must be a JSON object');
      }
    });

    it('rejects update where message_id is missing or non-integer', () => {
      const result = validateTelegramWebhookPayload({
        update_id: 10001,
        message: {
          date: 1708900000,
          chat: { id: -123, type: 'group' },
        },
      });
      expect(result.isValid).toBe(false);
      if (result.isValid === false) {
        expect(result.error).toContain('message.message_id must be a valid integer');
      }
    });

    it('rejects update where chat is missing or has invalid type', () => {
      const result = validateTelegramWebhookPayload({
        update_id: 10001,
        message: {
          message_id: 1,
          date: 1708900000,
          chat: { id: -123, type: 'unknown_chat_type' },
        },
      });
      expect(result.isValid).toBe(false);
      if (result.isValid === false) {
        expect(result.error).toContain('message.chat.type must be one of');
      }
    });

    it('rejects update with malformed from user object', () => {
      const result = validateTelegramWebhookPayload({
        update_id: 10001,
        message: {
          message_id: 1,
          date: 1708900000,
          chat: { id: -123, type: 'group' },
          from: 'Alex',
        },
      });
      expect(result.isValid).toBe(false);
      if (result.isValid === false) {
        expect(result.error).toContain('message.from must be an object');
      }
    });
  });
});
