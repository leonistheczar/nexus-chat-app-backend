import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  conversationParticipants,
  conversations,
} from "../db/schemas/conversation.schema.js";
import { users } from "../db/schemas/user.schema.js";
import type { Server } from "socket.io";
import type { AuthenticatedSocketData } from "./auth.js";
import type { SocketClientEvents, SocketServerEvents } from "./events.js";

export async function isActiveConversationParticipant(
  userId: string,
  conversationId: string,
): Promise<boolean> {
  const [participant] = await db
    .select({ userId: conversationParticipants.userId })
    .from(conversationParticipants)
    .innerJoin(
      conversations,
      eq(conversations.id, conversationParticipants.conversationId),
    )
    .innerJoin(users, eq(users.id, conversationParticipants.userId))
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId),
        eq(users.profileStatus, "active"),
        isNull(users.deletedAt),
      ),
    )
    .limit(1);

  return Boolean(participant);
}

export function conversationRoom(conversationId: string): string {
  return `conversation:${conversationId}`;
}

export function userRoom(userId: string): string {
  return `user:${userId}`;
}

/** Call immediately when removing a participant so their active devices stop receiving room events. */
export async function removeUserFromConversationRoom(
  io: Server<
    SocketClientEvents,
    SocketServerEvents,
    Record<string, never>,
    AuthenticatedSocketData
  >,
  userId: string,
  conversationId: string,
): Promise<void> {
  await io
    .in(userRoom(userId))
    .socketsLeave(conversationRoom(conversationId));
}
