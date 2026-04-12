import { z } from "zod";

export const appleSubscriptionSyncBodySchema = z.object({
  signedTransactionInfo: z.string().min(1).max(16_384),
});

export const appleNotificationBodySchema = z.object({
  signedPayload: z.string().min(1).max(65_536),
});

export type AppleNotificationBody = z.infer<typeof appleNotificationBodySchema>;
export type AppleSubscriptionSyncBody = z.infer<
  typeof appleSubscriptionSyncBodySchema
>;
