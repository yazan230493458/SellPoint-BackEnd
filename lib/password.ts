import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(8)
  .max(30)
  .regex(/[0-9]/, { message: "Password must contain a number" })
  .regex(/[a-z]/, { message: "Password must contain a lowercase letter" })
  .regex(/[A-Z]/, { message: "Password must contain an uppercase letter" })
  .regex(/[^A-Za-z0-9\s]/, {
    message: "Password must contain a special character",
  })
  .regex(/^\S+$/, { message: "Password must not contain spaces" });
