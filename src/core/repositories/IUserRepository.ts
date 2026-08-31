import { User } from '../domain/user';

export interface IUserRepository {
  getUserById(id: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  getAllUsers(): Promise<User[]>;
}
