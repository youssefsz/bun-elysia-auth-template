import type { AppConfig } from "../../config/env";
import type { GenieTurnResponse } from "../../schemas/genie.schemas";
import { genieTurnResponseSchema } from "../../schemas/genie.schemas";
import { AppError } from "../../utils/app-error";
import type { Logger } from "../../utils/logger";
import { ZodError } from "zod";

const OPENROUTER_CHAT_COMPLETIONS_URL =
  "https://openrouter.ai/api/v1/chat/completions";

interface OpenRouterGatewayInput {
  maxTokens: number;
  responseSchema: Record<string, unknown>;
  schemaName: string;
  systemPrompt: string;
  temperature: number;
  turnUserId: string;
  userPrompt: string;
}

export interface GenieGateway {
  createTurn(input: OpenRouterGatewayInput): Promise<GenieTurnResponse>;
}

interface OpenRouterGatewayDependencies {
  config: AppConfig;
  fetchImpl?: typeof fetch;
  logger: Logger;
}

interface OpenRouterErrorPayload {
  error?: {
    code?: number | string;
    message?: string;
  };
}

interface OpenRouterCompletionPayload {
  choices?: Array<{
    message?: {
      content?: string | Array<{ text?: string; type?: string }>;
    };
  }>;
}

export class OpenRouterGenieGateway implements GenieGateway {
  private readonly config: AppConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly logger: Logger;

  constructor(deps: OpenRouterGatewayDependencies) {
    this.config = deps.config;
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.logger = deps.logger;
  }

  async createTurn(input: OpenRouterGatewayInput): Promise<GenieTurnResponse> {
    if (!this.config.openRouterApiKey) {
      throw new AppError(
        503,
        "GENIE_PROVIDER_NOT_CONFIGURED",
        "Genie AI is not configured.",
      );
    }

    const response = await this.fetchUpstream(input);
    const content = this.extractContent(response);
    const parsedJson = this.parseJson(content);

    try {
      return genieTurnResponseSchema.parse(parsedJson);
    } catch (error) {
      if (error instanceof ZodError) {
        this.logger.error("genie.openrouter.invalid_shape", {
          error,
          userId: input.turnUserId,
        });
      }

      throw new AppError(
        502,
        "GENIE_INVALID_RESPONSE",
        "The genie answered with an invalid response.",
      );
    }
  }

  private async fetchUpstream(input: OpenRouterGatewayInput) {
    let response: Response;

    try {
      response = await this.fetchImpl(OPENROUTER_CHAT_COMPLETIONS_URL, {
        body: JSON.stringify({
          max_tokens: input.maxTokens,
          messages: [
            {
              content: input.systemPrompt,
              role: "system",
            },
            {
              content: input.userPrompt,
              role: "user",
            },
          ],
          model: this.config.openRouterModelId,
          response_format: {
            json_schema: {
              name: input.schemaName,
              schema: input.responseSchema,
              strict: true,
            },
            type: "json_schema",
          },
          temperature: input.temperature,
          user: input.turnUserId,
        }),
        headers: this.buildHeaders(),
        method: "POST",
      });
    } catch (error) {
      this.logger.error("genie.openrouter.network_error", {
        error,
        userId: input.turnUserId,
      });

      throw new AppError(
        502,
        "GENIE_UPSTREAM_ERROR",
        "The genie could not answer right now.",
      );
    }

    if (!response.ok) {
      const payload = (await response
        .json()
        .catch(() => null)) as OpenRouterErrorPayload | null;

      this.logger.error("genie.openrouter.http_error", {
        status: response.status,
        upstreamCode: payload?.error?.code,
        upstreamMessage: payload?.error?.message,
        userId: input.turnUserId,
      });

      throw new AppError(
        502,
        "GENIE_UPSTREAM_ERROR",
        "The genie could not answer right now.",
      );
    }

    const payload = (await response
      .json()
      .catch(() => null)) as OpenRouterCompletionPayload | null;

    if (!payload) {
      throw new AppError(
        502,
        "GENIE_INVALID_RESPONSE",
        "The genie answered with an invalid response.",
      );
    }

    return payload;
  }

  private buildHeaders() {
    return {
      Authorization: `Bearer ${this.config.openRouterApiKey}`,
      "Content-Type": "application/json",
      ...(this.config.openRouterAppName
        ? {
            "X-Title": this.config.openRouterAppName,
          }
        : {}),
      ...(this.config.openRouterSiteUrl
        ? {
            "HTTP-Referer": this.config.openRouterSiteUrl,
          }
        : {}),
    };
  }

  private extractContent(payload: OpenRouterCompletionPayload) {
    const content = payload.choices?.[0]?.message?.content;

    if (typeof content === "string") {
      const normalized = content.trim();

      if (normalized) {
        return normalized;
      }
    }

    if (Array.isArray(content)) {
      const normalized = content
        .filter((part) => part.type === "text")
        .map((part) => part.text?.trim() || "")
        .filter(Boolean)
        .join("\n")
        .trim();

      if (normalized) {
        return normalized;
      }
    }

    throw new AppError(
      502,
      "GENIE_INVALID_RESPONSE",
      "The genie answered with an invalid response.",
    );
  }

  private parseJson(content: string) {
    try {
      return JSON.parse(content);
    } catch (error) {
      this.logger.error("genie.openrouter.invalid_json", {
        error,
      });

      throw new AppError(
        502,
        "GENIE_INVALID_RESPONSE",
        "The genie answered with an invalid response.",
      );
    }
  }
}
