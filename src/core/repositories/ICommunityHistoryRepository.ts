import { ICommunityHistoryQueryRepository } from './ICommunityHistoryQueryRepository';
import { Discussion } from '../domain/discussion';
import { HistoricalTopicEvent } from '../domain/history';

export interface ICommunityHistoryRepository extends ICommunityHistoryQueryRepository {
  /**
   * Find a discussion by its provider-scoped external message provenance.
   */
  findDiscussionByProvenance(
    provider: string,
    externalCommunityId: string,
    externalMessageId: string
  ): Promise<Discussion | null>;

  /**
   * Save or replace a discussion entity.
   */
  saveDiscussion(discussion: Discussion): Promise<void>;

  /**
   * Save multiple discussions in a batch.
   */
  saveDiscussions(discussions: Discussion[]): Promise<void>;

  /**
   * Retrieve all discussions for a community (including both active and historical discussions).
   */
  getAllDiscussions(communityId: string): Promise<Discussion[]>;

  /**
   * Save or update a historical topic event.
   */
  saveHistoricalTopic(topic: HistoricalTopicEvent): Promise<void>;

  /**
   * Save multiple historical topic events.
   */
  saveHistoricalTopics(topics: HistoricalTopicEvent[]): Promise<void>;

  /**
   * Delete a discussion by community and ID.
   */
  deleteDiscussion(communityId: string, discussionId: string): Promise<void>;

  /**
   * Clear all records (testing utility).
   */
  clear(): Promise<void>;
}
