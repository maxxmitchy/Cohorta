import { CatchUpReadModel } from '../readmodels/CatchUpReadModel';

export interface ICatchUpService {
  getCatchUp(userId: string, communityId: string): Promise<CatchUpReadModel>;
}
