import { z } from "zod";
import { emailSchema } from "./auth.schemas";

export const updateAccountBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const deleteAccountBodySchema = z.object({
  confirmEmail: emailSchema,
});

export type UpdateAccountBody = z.infer<typeof updateAccountBodySchema>;
export type DeleteAccountBody = z.infer<typeof deleteAccountBodySchema>;
