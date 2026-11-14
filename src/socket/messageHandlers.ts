import { and, desc, eq, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { conversations } from "../db/schemas/conversation.schema.js";
import { messages } from "../db/schemas/message.schema.js";
import {
  conversationRoomPayload,
  messageHistoryPayload,
  sendTextMessagePayload,
  socketEvents,
  type MessageHistoryResult,
  type SocketAck,
} from "./events.js";
import {
  conversationRoom,
  isActiveConversationParticipant,
} from "./conversationAccess.js";
import type { AuthenticatedSocket } from "./auth.js";

const eventLimits = {
  join: { count: 30, windowMs: 60_000 },
  history: { count: 30, windowMs: 60_000 },
  send: { count: 30, windowMs: 60_000 },
} as const;

function takeRateLimit(socket: AuthenticatedSocket, key: keyof typeof eventLimits): boolean {
  const now = Date.now();
  const limit = eventLimits[key];
  const stateKey = `rate:${key}`;
  const current = (socket.data as Record<string, unknown>)[stateKey] as
    | { startedAt: number; count: number }
    | undefined;
  const next = !current || now - current.startedAt >= limit.windowMs
    ? { startedAt: now, count: 1 }
    : { ...current, count: current.count + 1 };
  (socket.data as Record<string, unknown>)[stateKey] = next;
  return next.count <= limit.count;
}

function failure<T>(code: string, message: string): SocketAck<T> {
  return { ok: false, error: { code, message } };
}

export function registerMessageHandlers(
  socket: AuthenticatedSocket,
): void {
  socket.on(socketEvents.joinConversation, async (input, acknowledge) => {
    if (!acknowledge) return;
    const parsed = conversationRoomPayload.safeParse(input);
    if (!parsed.success) {
      acknowledge(failure("INVALID_PAYLOAD", "Invalid conversation request"));
      return;
    }
    if (!takeRateLimit(socket, "join")) {
      acknowledge(failure("RATE_LIMITED", "Too many conversation requests"));
      return;
    }

    try {
      const { conversationId } = parsed.data;
      if (!(await isActiveConversationParticipant(socket.data.userId, conversationId))) {
        acknowledge(failure("FORBIDDEN", "Conversation access denied"));
        return;
      }
      await socket.join(conversationRoom(conversationId));
      acknowledge({ ok: true, data: { conversationId } });
    } catch {
      acknowledge(failure("INTERNAL_ERROR", "Could not join conversation"));
    }
  });

  socket.on(socketEvents.leaveConversation, async (input, acknowledge) => {
    if (!acknowledge) return;
    const parsed = conversationRoomPayload.safeParse(input);
    if (!parsed.success) {
      acknowledge(failure("INVALID_PAYLOAD", "Invalid conversation request"));
      return;
    }
    const { conversationId } = parsed.data;
    await socket.leave(conversationRoom(conversationId));
    acknowledge({ ok: true, data: { conversationId } });
  });

  socket.on(socketEvents.getMessageHistory, async (input, acknowledge) => {
    if (!acknowledge) return;
    const parsed = messageHistoryPayload.safeParse(input);
    if (!parsed.success) {
      acknowledge(failure("INVALID_PAYLOAD", "Invalid message history request"));
      return;
    }
    if (!takeRateLimit(socket, "history")) {
      acknowledge(failure("RATE_LIMITED", "Too many history requests"));
      return;
    }

    try {
      const { conversationId, before, limit } = parsed.data;
      if (!(await isActiveConversationParticipant(socket.data.userId, conversationId))) {
        acknowledge(failure("FORBIDDEN", "Conversation access denied"));
        return;
      }

      const conditions = [
        eq(messages.conversationId, conversationId),
        isNull(messages.deletedAt),
        isNotNull(messages.body),
      ];
      if (before) {
        const [cursor] = await db
          .select({ id: messages.id, createdAt: messages.createdAt })
          .from(messages)
          .where(
            and(
              eq(messages.id, before),
              eq(messages.conversationId, conversationId),
              isNull(messages.deletedAt),
              isNotNull(messages.body),
            ),
          )
          .limit(1);
        if (!cursor) {
          acknowledge(failure("INVALID_CURSOR", "Message cursor is invalid"));
          return;
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
          conversationId: messages.conversationId,
          senderId: messages.senderId,
          body: messages.body,
          createdAt: messages.createdAt,
          editedAt: messages.editedAt,
        })
        .from(messages)
        .where(and(...conditions))
        .orderBy(desc(messages.createdAt), desc(messages.id))
        .limit(limit);

      const result: MessageHistoryResult = {
        data: page.flatMap((message) =>
          message.body === null
            ? []
            : [{
                ...message,
                body: message.body,
                createdAt: message.createdAt.toISOString(),
                editedAt: message.editedAt?.toISOString() ?? null,
              }],
        ),
        nextCursor: page.length === limit ? page.at(-1)?.id ?? null : null,
      };
      acknowledge({ ok: true, data: result });
    } catch {
      acknowledge(failure("INTERNAL_ERROR", "Could not load message history"));
    }
  });

  socket.on(socketEvents.sendTextMessage, async (input, acknowledge) => {
    if (!acknowledge) return;
    const parsed = sendTextMessagePayload.safeParse(input);
    if (!parsed.success) {
      acknowledge(failure("INVALID_PAYLOAD", "Invalid text message"));
      return;
    }
    if (!takeRateLimit(socket, "send")) {
      acknowledge(failure("RATE_LIMITED", "Too many messages"));
      return;
    }

    try {
      const { conversationId, operationId, body } = parsed.data;
      const senderId = socket.data.userId;
      if (!(await isActiveConversationParticipant(senderId, conversationId))) {
        acknowledge(failure("FORBIDDEN", "Conversation access denied"));
        return;
      }

      // Neon HTTP batches execute in one transaction. The timestamp update is
      // based on the persisted operation row, so retries do not move activity
      // timestamps forward or broadcast a second logical send.
      const [inserted, , existingRows] = await db.batch([
        db
          .insert(messages)
          .values({
            conversationId,
            senderId,
            clientOperationId: operationId,
            body,
          })
          .onConflictDoNothing({
            target: [
              messages.conversationId,
              messages.senderId,
              messages.clientOperationId,
            ],
            where: isNotNull(messages.clientOperationId),
          })
          .returning({ id: messages.id }),
        db
          .update(conversations)
          .set({
            lastMessageAt: sql`greatest(coalesce(${conversations.lastMessageAt}, ${messages.createdAt}), ${messages.createdAt})`,
            updatedAt: sql`greatest(${conversations.updatedAt}, ${messages.createdAt})`,
          })
          .from(messages)
          .where(
            and(
              eq(conversations.id, conversationId),
              eq(messages.conversationId, conversationId),
              eq(messages.senderId, senderId),
              eq(messages.clientOperationId, operationId),
            ),
          ),
        db
          .select({
            id: messages.id,
            conversationId: messages.conversationId,
            senderId: messages.senderId,
            body: messages.body,
            createdAt: messages.createdAt,
            editedAt: messages.editedAt,
          })
          .from(messages)
          .where(
            and(
              eq(messages.conversationId, conversationId),
              eq(messages.senderId, senderId),
              eq(messages.clientOperationId, operationId),
            ),
          )
          .limit(1),
      ]);

      const message = existingRows[0];
      if (!message || message.body === null) {
        throw new Error("Persisted message could not be read");
      }
      if (message.body !== body) {
        acknowledge(
          failure(
            "OPERATION_ID_REUSED",
            "This operation ID was already used for a different message",
          ),
        );
        return;
      }

      const event = {
        ...message,
        body: message.body,
        createdAt: message.createdAt.toISOString(),
        editedAt: message.editedAt?.toISOString() ?? null,
      };
      const duplicate = inserted.length === 0;
      if (!duplicate) {
        socket.to(conversationRoom(conversationId)).emit(socketEvents.messageCreated, event);
      }
      acknowledge({ ok: true, data: { message: event, duplicate } });
    } catch {
      acknowledge(failure("INTERNAL_ERROR", "Could not send message"));
    }
  });
}
