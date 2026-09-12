import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Минимум 8 символов"),
  displayName: z.string().min(2).max(40),
});
export type RegisterInput = z.infer<typeof registerSchema>;

// ADMIN-only: create a WRITER/EDITOR/ADMIN account from the admin panel. PLAYER accounts are
// never created this way - they go through registerSchema/the public sign-up flow instead.
export const createStaffUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Минимум 8 символов"),
  displayName: z.string().min(2).max(40),
  role: z.enum(["WRITER", "EDITOR", "ADMIN"]),
});
export type CreateStaffUserInput = z.infer<typeof createStaffUserSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
