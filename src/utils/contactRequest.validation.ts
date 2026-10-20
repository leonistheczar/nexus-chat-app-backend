import * as z from "zod";

export const createContactRequestBody = z.object({
  username: z.string().trim().min(6).max(20).regex(/^[a-zA-Z0-9_]+$/).transform((value) => value.toLowerCase()),
});

export const contactRequestIdParam = z.object({
  requestId: z.uuid(),
});

export const listContactRequestsQuery = z.object({
  before: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
