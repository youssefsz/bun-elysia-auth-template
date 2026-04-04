export interface User {
  createdAt: Date;
  email: string;
  emailVerified: boolean;
  id: string;
  name: string;
  sessionVersion: number;
  updatedAt: Date;
}

export interface CreateUserInput {
  email: string;
  emailVerified: boolean;
  name: string;
  sessionVersion?: number;
}

export interface UpdateUserInput {
  emailVerified?: boolean;
  name?: string;
  sessionVersion?: number;
}

export interface UserRepository {
  create(input: CreateUserInput): Promise<User>;
  delete(id: string): Promise<boolean>;
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  incrementSessionVersion(id: string): Promise<User | null>;
  update(id: string, input: UpdateUserInput): Promise<User | null>;
}
