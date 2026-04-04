import type {
  AuthProviderRepository,
  EmailVerificationTokenRepository,
  LocalAuthCredentialRepository,
} from "../../domains/auth/auth.types";
import type { User, UserRepository } from "../../domains/users/user.types";
import { AppError } from "../../utils/app-error";

interface AccountServiceDependencies {
  authProviderRepository: AuthProviderRepository;
  emailVerificationTokenRepository: EmailVerificationTokenRepository;
  localAuthCredentialRepository: LocalAuthCredentialRepository;
  userRepository: UserRepository;
}

const mapAccount = (user: User) => ({
  createdAt: user.createdAt,
  email: user.email,
  emailVerified: user.emailVerified,
  id: user.id,
  name: user.name,
  updatedAt: user.updatedAt,
});

export class AccountService {
  constructor(private readonly deps: AccountServiceDependencies) {}

  async getAccount(userId: string) {
    return mapAccount(await this.getUserOrThrow(userId));
  }

  async updateAccount(userId: string, input: { name: string }) {
    const user = await this.deps.userRepository.update(userId, {
      name: input.name.trim(),
    });

    if (!user) {
      throw new AppError(404, "USER_NOT_FOUND", "User not found.");
    }

    return mapAccount(user);
  }

  async deleteAccount(userId: string, confirmEmail: string) {
    const user = await this.getUserOrThrow(userId);

    if (user.email.toLowerCase() !== confirmEmail.trim().toLowerCase()) {
      throw new AppError(
        400,
        "EMAIL_CONFIRMATION_MISMATCH",
        "Confirmation email does not match the current account.",
      );
    }

    await this.deps.authProviderRepository.deleteByUserId(userId);
    await this.deps.emailVerificationTokenRepository.deleteByUserId(userId);
    await this.deps.localAuthCredentialRepository.deleteByUserId(userId);

    const deleted = await this.deps.userRepository.delete(userId);

    if (!deleted) {
      throw new AppError(404, "USER_NOT_FOUND", "User not found.");
    }

    return {
      success: true,
    };
  }

  private async getUserOrThrow(userId: string): Promise<User> {
    const user = await this.deps.userRepository.findById(userId);

    if (!user) {
      throw new AppError(404, "USER_NOT_FOUND", "User not found.");
    }

    return user;
  }
}
