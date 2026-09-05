/**
 * Centralized Firestore collection and subcollection names.
 */
export const FirestoreCollections = {
  /**
   * Root collection for Community Integration mappings.
   * Document ID: `${provider}:${externalCommunityId}`
   */
  INTEGRATIONS: 'integrations',

  /**
   * Root collection for Ingestion Events, used for idempotency and worker locks.
   * Document ID: `${provider}:${externalCommunityId}:${externalEventId}`
   */
  INGESTION_EVENTS: 'ingestion_events',

  /**
   * Root collection for canonical Discussions.
   * Document ID: Internal discussion ID (e.g., `disc_telegram_...`)
   */
  DISCUSSIONS: 'discussions',

  /**
   * Subcollection under DISCUSSIONS for replies, mitigating document size limits.
   * Path: `discussions/{discussionId}/replies/{replyId}`
   */
  REPLIES_SUBCOLLECTION: 'replies',

  /**
   * Root collection for Telegram or generic integration reconciliation checkpoints.
   * Document ID: `botId` or integration identifier.
   */
  CHECKPOINTS: 'checkpoints',
} as const;
