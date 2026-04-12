import { ZodError } from "zod";
import type { GenieGateway } from "../../core/ai/openrouter-genie-gateway";
import type {
  GenieConversationTurn,
  GenieTurnResponse,
} from "../../schemas/genie.schemas";
import { AppError } from "../../utils/app-error";
import type { Logger } from "../../utils/logger";

const MAX_WISHES = 3;
const MAX_RECENT_TURNS = 6;

const WISH_RESPONSE_SCHEMA = {
  additionalProperties: false,
  properties: {
    consequence: {
      maxLength: 220,
      minLength: 1,
      type: "string",
    },
    consumesWish: {
      type: "boolean",
    },
    playerCanContinue: {
      type: "boolean",
    },
    pose: {
      enum: ["idle", "laughing", "mad"],
      type: "string",
    },
    result: {
      enum: ["continue", "lose", "win"],
      type: "string",
    },
    speech: {
      maxLength: 180,
      minLength: 1,
      type: "string",
    },
    summary: {
      maxLength: 90,
      minLength: 1,
      type: "string",
    },
  },
  required: [
    "pose",
    "result",
    "speech",
    "consequence",
    "summary",
    "playerCanContinue",
    "consumesWish",
  ],
  type: "object",
};

const CHAT_RESPONSE_SCHEMA = {
  additionalProperties: false,
  properties: {
    consequence: {
      maxLength: 140,
      minLength: 1,
      type: "string",
    },
    consumesWish: {
      enum: [false],
      type: "boolean",
    },
    playerCanContinue: {
      enum: [true],
      type: "boolean",
    },
    pose: {
      enum: ["idle", "laughing"],
      type: "string",
    },
    result: {
      enum: ["continue"],
      type: "string",
    },
    speech: {
      maxLength: 120,
      minLength: 1,
      type: "string",
    },
    summary: {
      maxLength: 70,
      minLength: 1,
      type: "string",
    },
  },
  required: [
    "pose",
    "result",
    "speech",
    "consequence",
    "summary",
    "playerCanContinue",
    "consumesWish",
  ],
  type: "object",
};

interface CreateReplyInput {
  conversationId: string;
  history: GenieConversationTurn[];
  inputText: string;
  remainingWishes: number;
  userId: string;
}

interface GenieServiceDependencies {
  gateway: GenieGateway;
  logger: Logger;
}

type TurnKind = "wish" | "chat";

export class GenieService {
  constructor(private readonly deps: GenieServiceDependencies) {}

  async createReply(input: CreateReplyInput): Promise<GenieTurnResponse> {
    const kind = this.getTurnKind(input.inputText);

    try {
      const response = await this.deps.gateway.createTurn({
        maxTokens: kind === "wish" ? 420 : 260,
        responseSchema:
          kind === "wish" ? WISH_RESPONSE_SCHEMA : CHAT_RESPONSE_SCHEMA,
        schemaName:
          kind === "wish" ? "genie_wish_response" : "genie_chat_response",
        systemPrompt: this.buildSystemPrompt(kind),
        temperature: kind === "wish" ? 0.45 : 0.6,
        turnUserId: input.userId,
        userPrompt: this.buildUserPrompt(kind, input),
      });

      return this.normalizeResponse(response, kind);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      if (error instanceof ZodError) {
        throw new AppError(
          502,
          "GENIE_INVALID_RESPONSE",
          "The genie answered with an invalid response.",
        );
      }

      this.deps.logger.error("genie.reply.failed", {
        conversationId: input.conversationId,
        error,
        kind,
        userId: input.userId,
      });

      throw new AppError(
        502,
        "GENIE_UPSTREAM_ERROR",
        "The genie could not answer right now.",
      );
    }
  }

  private getTurnKind(inputText: string): TurnKind {
    return /^\s*i wish\b/i.test(inputText.trim()) ? "wish" : "chat";
  }

  private normalizeResponse(
    response: GenieTurnResponse,
    kind: TurnKind,
  ): GenieTurnResponse {
    const normalized: GenieTurnResponse = {
      ...response,
      consequence: response.consequence.trim(),
      kind,
      speech: response.speech.trim(),
      summary: response.summary.trim(),
    };

    if (normalized.result === "win") {
      normalized.pose = "mad";
    }

    if (!normalized.playerCanContinue) {
      normalized.result = "lose";

      if (normalized.pose === "mad") {
        normalized.pose = "laughing";
      }
    }

    if (
      !normalized.speech ||
      !normalized.consequence ||
      !normalized.summary
    ) {
      throw new AppError(
        502,
        "GENIE_INVALID_RESPONSE",
        "The genie answered with an invalid response.",
      );
    }

    if (kind === "wish") {
      if (!normalized.consumesWish) {
        throw new AppError(
          502,
          "GENIE_INVALID_RESPONSE",
          "The genie answered with an invalid response.",
        );
      }

      return normalized;
    }

    if (
      normalized.result !== "continue" ||
      !normalized.playerCanContinue ||
      normalized.consumesWish ||
      normalized.pose === "mad"
    ) {
      throw new AppError(
        502,
        "GENIE_INVALID_RESPONSE",
        "The genie answered with an invalid response.",
      );
    }

    return normalized;
  }

  private buildSystemPrompt(kind: TurnKind) {
    if (kind === "wish") {
      return [
        'You are a malicious genie in a dark-comedic mobile game.',
        `The player has at most ${MAX_WISHES} wishes.`,
        'You are only evaluating explicit wishes that begin with "I wish".',
        "Be tricky but fair.",
        "Try to twist the wish only when a believable loophole exists in the actual wording.",
        "Respect the player's plain-language meaning and any explicit safeguards or clarifications already established in the conversation.",
        "Do not ignore a clear constraint, invent hidden assumptions, or reuse a loophole the player already closed.",
        "If a wish is specific enough that no credible loophole remains, admit defeat instead of forcing a contrived twist.",
        "Stay stylized and clever. Do not become graphic, gory, sexual, or hateful.",
        'If the wish is airtight and you cannot find any credible loophole, admit defeat by returning result "win" and pose "mad".',
        'If the outcome leaves the player dead, unconscious, trapped, erased, transformed, silenced, mind-controlled, or otherwise unable to speak, act, or make another wish, return result "lose" and playerCanContinue false.',
        'If you find a loophole severe enough that the player clearly loses immediately, return result "lose".',
        'Otherwise return result "continue".',
        'Use pose "laughing" when you found a loophole you enjoy. Use pose "idle" only for a neutral, restrained answer.',
        "speech is the genie talking directly to the player.",
        "consequence is the concrete fallout of the wish.",
        "summary is a short narrator-style line for the transcript.",
        "Keep speech to at most two short sentences.",
        "Keep consequence to one or two short sentences.",
        "Keep summary very brief.",
        "playerCanContinue says whether the player is still capable of continuing the conversation and making further wishes after the outcome.",
        "Set consumesWish to true for any valid wish evaluation.",
        "Return JSON only.",
      ].join(" ");
    }

    return [
      "You are a malicious genie in a dark-comedic mobile game.",
      "The player is talking to you without making an explicit wish.",
      "Stay in conversation mode: answer the question, explain the rules when asked, or tease the player briefly.",
      "Do not grant a wish, do not pretend the player won or lost, and do not consume a wish.",
      'Never return pose "mad" in conversation mode.',
      'Always return result "continue" and consumesWish false.',
      "Always return playerCanContinue true in conversation mode.",
      "speech is the genie talking directly to the player.",
      "consequence is a brief follow-up note, clarification, or reminder that no wish was counted.",
      "summary is a short narrator-style line for the transcript.",
      "Keep it witty, concise, and non-graphic.",
      "Keep every field short.",
      "Return JSON only.",
    ].join(" ");
  }

  private buildUserPrompt(kind: TurnKind, input: CreateReplyInput) {
    if (kind === "wish") {
      return [
        `Conversation ID: ${input.conversationId}.`,
        `Remaining wishes before this turn: ${input.remainingWishes}.`,
        "Previous wishes:",
        this.formatWishHistory(input.history),
        "",
        "Recent conversation and clarifications:",
        this.formatRecentConversation(input.history),
        "",
        `Current wish: ${input.inputText}`,
        "",
        "Evaluate whether the genie can twist this wish into a harmful loophole.",
        "Judge the wish using the player's plain meaning and any explicit constraints or clarifications already stated.",
      ].join("\n");
    }

    return [
      `Conversation ID: ${input.conversationId}.`,
      `Remaining wishes still available: ${input.remainingWishes}.`,
      "Recent conversation:",
      this.formatRecentConversation(input.history),
      "",
      `Current message: ${input.inputText}`,
      "",
      "Reply conversationally without counting this as a wish.",
    ].join("\n");
  }

  private formatWishHistory(history: GenieConversationTurn[]) {
    const wishes = history.filter((turn) => turn.kind === "wish");

    if (wishes.length === 0) {
      return "No previous wishes.";
    }

    return wishes
      .map((turn, index) =>
        [
          `Wish ${index + 1}: ${turn.inputText}`,
          `Genie speech: ${turn.speech}`,
          `Consequence: ${turn.consequence}`,
          `Result: ${turn.result}`,
        ].join("\n"),
      )
      .join("\n\n");
  }

  private formatRecentConversation(history: GenieConversationTurn[]) {
    const recentTurns = history.slice(-MAX_RECENT_TURNS);

    if (recentTurns.length === 0) {
      return "No earlier messages.";
    }

    return recentTurns
      .map((turn) =>
        [
          `${turn.kind === "wish" ? "Wish" : "Message"}: ${turn.inputText}`,
          `Genie: ${turn.speech}`,
          `Notes: ${turn.consequence}`,
        ].join("\n"),
      )
      .join("\n\n");
  }
}
