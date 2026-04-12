import { z } from "zod";

export const genieStateSchema = z.enum(["idle", "laughing", "mad"]);
export const genieTurnKindSchema = z.enum(["wish", "chat"]);
export const genieTurnResultSchema = z.enum(["continue", "lose", "win"]);

const optionalDateLikeSchema = z.union([
  z.string().trim().min(1),
  z.number().finite(),
  z.date(),
]);

export const genieConversationTurnSchema = z.object({
  consumesWish: z.boolean(),
  consequence: z.string().trim().min(1).max(220),
  createdAt: optionalDateLikeSchema.optional(),
  id: z.string().trim().min(1),
  inputText: z.string().trim().min(1).max(2_000),
  kind: genieTurnKindSchema,
  playerCanContinue: z.boolean(),
  pose: genieStateSchema,
  result: genieTurnResultSchema,
  speech: z.string().trim().min(1).max(180),
  summary: z.string().trim().min(1).max(90),
});

export const genieChatBodySchema = z.object({
  conversationId: z.string().trim().min(1).max(128),
  history: z.array(genieConversationTurnSchema).max(40),
  inputText: z.string().trim().min(1).max(2_000),
  remainingWishes: z.number().int().min(0).max(3),
});

export const genieTurnResponseSchema = z.object({
  consumesWish: z.boolean(),
  consequence: z.string().trim().min(1).max(220),
  kind: genieTurnKindSchema,
  playerCanContinue: z.boolean(),
  pose: genieStateSchema,
  result: genieTurnResultSchema,
  speech: z.string().trim().min(1).max(180),
  summary: z.string().trim().min(1).max(90),
});

export type GenieChatBody = z.infer<typeof genieChatBodySchema>;
export type GenieConversationTurn = z.infer<typeof genieConversationTurnSchema>;
export type GenieTurnResponse = z.infer<typeof genieTurnResponseSchema>;
