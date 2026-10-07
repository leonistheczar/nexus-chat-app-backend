import { getAuth } from "@clerk/express";
import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import express from "express";
import * as z from "zod";
import { db } from "../db/index.js";
import {
  conversationParticipants,
  conversations,
} from "../db/schemas/conversation.schema.js";
import {
  messageAttachments,
  messages,
} from "../db/schemas/message.schema.js";
import { users } from "../db/schemas/user.schema.js";

const router = express.Router();

async function resolveSelfConversation(req: express.Request) {
  const auth = getAuth(req);
  if (!auth.isAuthenticated) return { status: 401 as const };

  const user = await db.query.users.findFirst({
    where: eq(users.clerkUserId, auth.userId),
    columns: { id: true },
  });
  if (!user) return { status: 404 as const };

  const [conversation] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .innerJoin(
      conversationParticipants,
      eq(conversationParticipants.conversationId, conversations.id),
    )
    .where(
      and(
        eq(conversations.createdByUserId, user.id),
        eq(conversations.kind, "self"),
        eq(conversationParticipants.userId, user.id),
      ),
    )
    .limit(1);
  if (!conversation) return { status: 404 as const };

  return {
    status: 200 as const,
    userId: user.id,
    conversationId: conversation.id,
  };
}

router.get("/self-chat/messages", async (req, res, next) => {
  try {
    const resolved = await resolveSelfConversation(req);
    if (resolved.status === 401) {
      return res.status(401).json({ data: null, message: "Unauthorized" });
    }
    if (resolved.status === 404) {
      return res.status(404).json({ data: null, message: "Self-chat not found" });
    }

    const queryValidation = z
      .object({
        before: z.uuid().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .safeParse(req.query);
    if (!queryValidation.success) {
      return res.status(400).json({
        data: null,
        message: "Invalid pagination parameters",
        errors: z.treeifyError(queryValidation.error),
      });
    }

    const { before, limit } = queryValidation.data;
    const conditions = [
      eq(messages.conversationId, resolved.conversationId),
      isNull(messages.deletedAt),
    ];

    if (before) {
      const cursor = await db.query.messages.findFirst({
        where: and(
          eq(messages.id, before),
          eq(messages.conversationId, resolved.conversationId),
        ),
        columns: { id: true, createdAt: true },
      });
      if (!cursor) {
        return res
          .status(400)
          .json({ data: null, message: "Invalid message cursor" });
      }
      conditions.push(
        or(
          lt(messages.createdAt, cursor.createdAt),
          and(
            eq(messages.createdAt, cursor.createdAt),
            lt(messages.id, cursor.id),
          ),
        )!,
      );
    }

    const page = await db
      .select({
        id: messages.id,
        body: messages.body,
        createdAt: messages.createdAt,
        editedAt: messages.editedAt,
      })
      .from(messages)
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(limit);

    const attachments = page.length
      ? await db
          .select({
            id: messageAttachments.id,
            messageId: messageAttachments.messageId,
            mediaType: messageAttachments.mediaType,
            originalFileName: messageAttachments.originalFileName,
            sizeBytes: messageAttachments.sizeBytes,
            createdAt: messageAttachments.createdAt,
          })
          .from(messageAttachments)
          .where(inArray(messageAttachments.messageId, page.map(({ id }) => id)))
      : [];
    const attachmentsByMessage = new Map<string, typeof attachments>();
    for (const attachment of attachments) {
      const items = attachmentsByMessage.get(attachment.messageId) ?? [];
      items.push(attachment);
      attachmentsByMessage.set(attachment.messageId, items);
    }

    return res.status(200).json({
      data: page.map((message) => ({
        ...message,
        attachments: attachmentsByMessage.get(message.id) ?? [],
      })),
      nextCursor: page.length === limit ? page[page.length - 1]?.id : null,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/self-chat/messages", async (req, res, next) => {
  const bodyValidation = z
    .object({ body: z.string().trim().min(1).max(10000) })
    .safeParse(req.body);
  if (!bodyValidation.success) {
    return res.status(400).json({
      data: null,
      message: "Invalid message",
      errors: z.treeifyError(bodyValidation.error),
    });
  }

  try {
    const resolved = await resolveSelfConversation(req);
    if (resolved.status === 401) {
      return res.status(401).json({ data: null, message: "Unauthorized" });
    }
    if (resolved.status === 404) {
      return res.status(404).json({ data: null, message: "Self-chat not found" });
    }

    const [createdMessages] = await db.batch([
      db
        .insert(messages)
        .values({
          conversationId: resolved.conversationId,
          senderId: resolved.userId,
          body: bodyValidation.data.body,
        })
        .returning({
          id: messages.id,
          body: messages.body,
          createdAt: messages.createdAt,
        }),
      db
        .update(conversations)
        .set({
          lastMessageAt: sql`greatest(coalesce(${conversations.lastMessageAt}, now()), now())`,
          updatedAt: sql`greatest(${conversations.updatedAt}, now())`,
        })
        .where(eq(conversations.id, resolved.conversationId)),
    ]);

    const message = createdMessages[0];
    if (!message) throw new Error("Failed to create self-chat message");

    return res.status(201).json({ data: message });
  } catch (err) {
    next(err);
  }
});

export default router;
