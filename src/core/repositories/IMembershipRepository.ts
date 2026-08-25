import { Membership } from '../domain/membership';

export interface IMembershipRepository {
  getMembership(userId: string, communityId: string): Promise<Membership | null>;
}
