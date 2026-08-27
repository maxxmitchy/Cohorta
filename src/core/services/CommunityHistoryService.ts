import { ICommunityHistoryService } from './ICommunityHistoryService';
import { ICommunityHistoryQueryRepository } from '../repositories/ICommunityHistoryQueryRepository';
import { IMembershipRepository } from '../repositories/IMembershipRepository';
import { CommunityHistoryReadModel } from '../readmodels/CommunityHistoryReadModel';
import { Discussion } from '../domain/discussion';

export class CommunityHistoryService implements ICommunityHistoryService {
  constructor(
    private readonly historyQueryRepo: ICommunityHistoryQueryRepository,
    private readonly membershipRepo: IMembershipRepository
  ) {}

  private async verifyActiveMembership(userId: string, communityId: string): Promise<void> {
    if (!userId || userId.trim() === '') {
      throw new Error('Authentication required to access community history.');
    }

    // Check if user is community creator
    const community = await this.membershipRepo.getCommunity(communityId);
    if (!community) {
      throw new Error(`Community with ID "${communityId}" does not exist.`);
    }

    if (community.creatorId === userId) {
      return; // Creator has full access
    }

    const membership = await this.membershipRepo.getMembership(userId, communityId);
    if (!membership || membership.status !== 'active') {
      throw new Error('Access denied: You must be an active member of this community to view its history.');
    }
  }

  async getCommunityHistory(userId: string, communityId: string): Promise<CommunityHistoryReadModel> {
    await this.verifyActiveMembership(userId, communityId);

    const history = await this.historyQueryRepo.getCommunityHistory(communityId);
    if (!history) {
      throw new Error(`History not found for community "${communityId}".`);
    }

    return history;
  }

  async getDiscussion(userId: string, communityId: string, discussionId: string): Promise<Discussion> {
    await this.verifyActiveMembership(userId, communityId);

    const discussion = await this.historyQueryRepo.getDiscussionById(communityId, discussionId);
    if (!discussion) {
      throw new Error(`Discussion "${discussionId}" not found in community "${communityId}".`);
    }

    return discussion;
  }
}
