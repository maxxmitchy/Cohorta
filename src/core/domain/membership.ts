export type PlanInterval = 'month' | 'year' | 'lifetime';
export type PlanType = 'free' | 'subscription' | 'one_time';

export interface MembershipPlan {
  id: string;
  communityId: string;
  name: string;
  type: PlanType;
  priceAmount: number; // Stored in smallest currency unit (e.g., cents)
  priceCurrency: string;
  interval?: PlanInterval; 
  isActive: boolean;
}

export type MembershipRole = 'member' | 'admin' | 'mentor';

export interface Membership {
  id: string;
  userId: string;
  communityId: string;
  planId: string;
  role: MembershipRole;
  joinedAt: Date;
  status: 'active' | 'past_due' | 'canceled';
}
