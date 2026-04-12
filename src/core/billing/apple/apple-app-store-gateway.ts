import { readFileSync } from "node:fs";
import {
  AppStoreServerAPIClient,
  Environment,
  SignedDataVerifier,
  type JWSRenewalInfoDecodedPayload,
  type JWSTransactionDecodedPayload,
  type ResponseBodyV2DecodedPayload,
  type StatusResponse,
} from "@apple/app-store-server-library";
import type { AppConfig } from "../../../config/env";
import type { BillingEnvironment } from "../../../domains/billing/billing.types";
import { AppError } from "../../../utils/app-error";
import type { Logger } from "../../../utils/logger";

export interface AppleBillingGateway {
  getAllSubscriptionStatuses(input: {
    environment: BillingEnvironment;
    transactionId: string;
  }): Promise<StatusResponse>;
  isEnabled(): boolean;
  setAppAccountToken(input: {
    appAccountToken: string;
    environment: BillingEnvironment;
    originalTransactionId: string;
  }): Promise<void>;
  verifyNotification(
    signedPayload: string,
  ): Promise<ResponseBodyV2DecodedPayload>;
  verifySignedRenewalInfo(
    signedRenewalInfo: string,
  ): Promise<JWSRenewalInfoDecodedPayload>;
  verifySignedTransaction(
    signedTransactionInfo: string,
  ): Promise<JWSTransactionDecodedPayload>;
}

const isSupportedBillingEnvironment = (
  value: string | undefined,
): value is Environment => value === Environment.PRODUCTION || value === Environment.SANDBOX;

const normalizeEnvironment = (value: string | undefined): BillingEnvironment => {
  if (value === Environment.PRODUCTION) {
    return "production";
  }

  return "sandbox";
};

const toAppleEnvironment = (environment: BillingEnvironment) =>
  environment === "production" ? Environment.PRODUCTION : Environment.SANDBOX;

class DisabledAppleBillingGateway implements AppleBillingGateway {
  isEnabled() {
    return false;
  }

  async getAllSubscriptionStatuses(): Promise<StatusResponse> {
    throw new AppError(
      503,
      "APPLE_BILLING_UNAVAILABLE",
      "Apple billing is not configured on this server.",
    );
  }

  async setAppAccountToken(): Promise<void> {
    throw new AppError(
      503,
      "APPLE_BILLING_UNAVAILABLE",
      "Apple billing is not configured on this server.",
    );
  }

  async verifyNotification(): Promise<ResponseBodyV2DecodedPayload> {
    throw new AppError(
      503,
      "APPLE_BILLING_UNAVAILABLE",
      "Apple billing is not configured on this server.",
    );
  }

  async verifySignedRenewalInfo(): Promise<JWSRenewalInfoDecodedPayload> {
    throw new AppError(
      503,
      "APPLE_BILLING_UNAVAILABLE",
      "Apple billing is not configured on this server.",
    );
  }

  async verifySignedTransaction(): Promise<JWSTransactionDecodedPayload> {
    throw new AppError(
      503,
      "APPLE_BILLING_UNAVAILABLE",
      "Apple billing is not configured on this server.",
    );
  }
}

class AppleAppStoreGateway implements AppleBillingGateway {
  constructor(
    private readonly clients: Record<BillingEnvironment, AppStoreServerAPIClient>,
    private readonly logger: Logger,
    private readonly verifiers: Partial<Record<BillingEnvironment, SignedDataVerifier>>,
  ) {}

  isEnabled() {
    return true;
  }

  async getAllSubscriptionStatuses(input: {
    environment: BillingEnvironment;
    transactionId: string;
  }) {
    return this.clients[input.environment].getAllSubscriptionStatuses(
      input.transactionId,
    );
  }

  async setAppAccountToken(input: {
    appAccountToken: string;
    environment: BillingEnvironment;
    originalTransactionId: string;
  }) {
    await this.clients[input.environment].setAppAccountToken(
      input.originalTransactionId,
      {
        appAccountToken: input.appAccountToken,
      },
    );
  }

  async verifyNotification(signedPayload: string) {
    const payload = await this.tryVerifiers((verifier) =>
      verifier.verifyAndDecodeNotification(signedPayload),
    );

    if (
      payload.data?.environment &&
      !isSupportedBillingEnvironment(payload.data.environment)
    ) {
      throw new AppError(
        400,
        "APPLE_ENVIRONMENT_UNSUPPORTED",
        "Unsupported Apple subscription environment.",
      );
    }

    return payload;
  }

  async verifySignedRenewalInfo(signedRenewalInfo: string) {
    const renewal = await this.tryVerifiers((verifier) =>
      verifier.verifyAndDecodeRenewalInfo(signedRenewalInfo),
    );

    if (
      renewal.environment &&
      !isSupportedBillingEnvironment(renewal.environment)
    ) {
      throw new AppError(
        400,
        "APPLE_ENVIRONMENT_UNSUPPORTED",
        "Unsupported Apple subscription environment.",
      );
    }

    return renewal;
  }

  async verifySignedTransaction(signedTransactionInfo: string) {
    const transaction = await this.tryVerifiers((verifier) =>
      verifier.verifyAndDecodeTransaction(signedTransactionInfo),
    );

    if (
      transaction.environment &&
      !isSupportedBillingEnvironment(transaction.environment)
    ) {
      throw new AppError(
        400,
        "APPLE_ENVIRONMENT_UNSUPPORTED",
        "Unsupported Apple subscription environment.",
      );
    }

    return transaction;
  }

  private async tryVerifiers<T>(
    operation: (verifier: SignedDataVerifier) => Promise<T>,
  ) {
    const attempts = (
      Object.entries(this.verifiers) as [BillingEnvironment, SignedDataVerifier][]
    ).filter(([, verifier]) => Boolean(verifier));
    let lastError: unknown;

    for (const [environment, verifier] of attempts) {
      try {
        return await operation(verifier);
      } catch (error) {
        lastError = error;
        this.logger.warn("apple.billing.verification_attempt_failed", {
          environment,
          error,
        });
      }
    }

    throw new AppError(
      400,
      "APPLE_SIGNATURE_INVALID",
      "Apple signed data could not be verified.",
      {
        cause: lastError instanceof Error ? lastError.message : String(lastError),
      },
    );
  }
}

const buildClient = (config: AppConfig, environment: BillingEnvironment) =>
  new AppStoreServerAPIClient(
    config.appleSubscriptionServerPrivateKey!,
    config.appleSubscriptionServerKeyId!,
    config.appleSubscriptionServerIssuerId!,
    config.appleAppStoreBundleId!,
    toAppleEnvironment(environment),
  );

const buildVerifier = (config: AppConfig, environment: BillingEnvironment) => {
  const buffers = config.appleRootCaPaths.map((path) => readFileSync(path));

  return new SignedDataVerifier(
    buffers,
    config.appleEnableOnlineChecks,
    toAppleEnvironment(environment),
    config.appleAppStoreBundleId!,
    environment === "production" ? config.appleAppStoreAppId : undefined,
  );
};

const hasAppleGatewayConfig = (config: AppConfig) =>
  Boolean(
    config.appleAppStoreBundleId &&
      config.appleSubscriptionServerIssuerId &&
      config.appleSubscriptionServerKeyId &&
      config.appleSubscriptionServerPrivateKey &&
      config.appleRootCaPaths.length > 0 &&
      config.appleSubscriptionProducts.length > 0,
  );

export const createAppleBillingGateway = (
  config: AppConfig,
  logger: Logger,
): AppleBillingGateway => {
  if (!hasAppleGatewayConfig(config)) {
    logger.warn("apple.billing.disabled", {
      reason: "missing_configuration",
    });

    return new DisabledAppleBillingGateway();
  }

  try {
    const clients: Record<BillingEnvironment, AppStoreServerAPIClient> = {
      production: buildClient(config, "production"),
      sandbox: buildClient(config, "sandbox"),
    };
    const verifiers: Partial<Record<BillingEnvironment, SignedDataVerifier>> = {
      sandbox: buildVerifier(config, "sandbox"),
    };

    if (config.appleAppStoreAppId) {
      verifiers.production = buildVerifier(config, "production");
    } else {
      logger.warn("apple.billing.production_verifier_disabled", {
        reason: "missing_app_store_app_id",
      });
    }

    return new AppleAppStoreGateway(clients, logger, verifiers);
  } catch (error) {
    logger.error("apple.billing.initialization_failed", {
      error,
    });

    return new DisabledAppleBillingGateway();
  }
};

export const billingEnvironmentFromAppleValue = (
  value: string | undefined,
): BillingEnvironment => normalizeEnvironment(value);
