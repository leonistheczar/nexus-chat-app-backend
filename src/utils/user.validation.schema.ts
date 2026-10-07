import * as z from "zod";

// This file is globally used for validation for everything that needs to be check

// User Schema
export const userValidation = z.object({
    firstName: z.string().min(2).max(40),
    lastName: z.string().min(0).max(40),
    username: z.string().min(6).max(20).regex(/^[a-zA-Z0-9_]+$/),
    email: z.email().max(255),
    displayName: z.string().min(0).max(90),
    phoneE164: z
    .string()
    .max(16)
    .regex(/^\+[1-9]\d{7,14}$/, "Invalid E.164 phone number"),});
