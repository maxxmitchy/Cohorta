export type UserRole = 'learner' | 'creator' | 'mentor' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  role: UserRole;
  createdAt: Date;
}
