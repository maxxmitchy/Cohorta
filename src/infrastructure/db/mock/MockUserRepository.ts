import { IUserRepository } from '../../../core/repositories/IUserRepository';
import { User } from '../../../core/domain/user';
import { mockUsers } from './mockData';

export class MockUserRepository implements IUserRepository {
  async getUserById(id: string): Promise<User | null> {
    const user = mockUsers.find((u) => u.id === id);
    return user ? { ...user } : null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const user = mockUsers.find((u) => u.email.toLowerCase() === email.toLowerCase());
    return user ? { ...user } : null;
  }

  async getAllUsers(): Promise<User[]> {
    return mockUsers.map((u) => ({ ...u }));
  }
}
