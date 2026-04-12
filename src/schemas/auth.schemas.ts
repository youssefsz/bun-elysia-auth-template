import { z } from "zod";

export const emailSchema = z.string().trim().email().max(320);

const optionalProviderNameSchema = z.preprocess(
  (value) => (value === null ? undefined : value),
  z.string().trim().min(1).max(120).optional(),
);

export const appleAuthBodySchema = z.object({
  idToken: z.string().min(1).max(8_192),
  name: optionalProviderNameSchema,
});

export const googleAuthBodySchema = z.object({
  idToken: z.string().min(1).max(8_192),
});

export const loginBodySchema = z.object({
  email: emailSchema,
  password: z.string().min(8).max(128),
});

export const registerBodySchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1).max(120),
  password: z.string().min(8).max(128),
});

export const emailVerificationRequestBodySchema = z.object({
  email: emailSchema,
});

export const verifyEmailBodySchema = z.object({
  token: z.string().min(1).max(512),
});

export const verifyEmailQuerySchema = z.object({
  token: z.string().min(1).max(512),
});

export const passwordResetRequestBodySchema = z.object({
  email: emailSchema,
});

export const passwordResetConfirmBodySchema = z.object({
  password: z.string().min(8).max(128),
  token: z.string().min(1).max(512),
});

export type GoogleAuthBody = z.infer<typeof googleAuthBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
export type RegisterBody = z.infer<typeof registerBodySchema>;
export type EmailVerificationRequestBody = z.infer<
  typeof emailVerificationRequestBodySchema
>;
export type PasswordResetConfirmBody = z.infer<
  typeof passwordResetConfirmBodySchema
>;
export type PasswordResetRequestBody = z.infer<
  typeof passwordResetRequestBodySchema
>;
export type VerifyEmailBody = z.infer<typeof verifyEmailBodySchema>;
export type VerifyEmailQuery = z.infer<typeof verifyEmailQuerySchema>;
