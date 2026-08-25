import { ICommunityDetailQueryRepository } from '../repositories/ICommunityDetailQueryRepository';
import { CommunityDetailReadModel } from '../readmodels/CommunityDetailReadModel';

export class CommunityDetailService {
  constructor(private readonly detailRepo: ICommunityDetailQueryRepository) {}

  public async getCommunityDetail(communityId: string): Promise<CommunityDetailReadModel | null> {
    return this.detailRepo.getCommunityDetail(communityId);
  }
}
