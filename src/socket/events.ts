import * as z from "zod";

/** Stable event names shared by the frontend and backend socket clients. */
export const socketEvents = {
  joinConversation: "conversation:join",
  leaveConversation: "conversation:leave",
  getMessageHistory: "messages:history",
  sendTextMessage: "messages:send",
  messageCreated: "messages:created",
} as const;

export const conversationRoomPayload = z.object({
  conversationId: z.uuid(),
});

export const messageHistoryPayload = z.object({
  conversationId: z.uuid(),
  before: z.uuid().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export const sendTextMessagePayload = z.object({
  conversationId: z.uuid(),
  /** Stable across retries of one user action; new sends must use a new ID. */
  operationId: z.uuid(),
  body: z.string().trim().min(1).max(10_000),
});

export type ConversationRoomPayload = z.infer<typeof conversationRoomPayload>;
export type MessageHistoryPayload = z.infer<typeof messageHistoryPayload>;
export type SendTextMessagePayload = z.infer<typeof sendTextMessagePayload>;

export type SocketAck<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

/** Serialized message shape used by history responses and live broadcasts. */
export type TextMessageEvent = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
};

export type MessageHistoryResult = {
  data: TextMessageEvent[];
  nextCursor: string | null;
};

export type SocketClientEvents = {
  [socketEvents.joinConversation]: (
    payload: unknown,
    acknowledge?: (result: SocketAck<{ conversationId: string }>) => void,
  ) => void;
  [socketEvents.leaveConversation]: (
    payload: unknown,
    acknowledge?: (result: SocketAck<{ conversationId: string }>) => void,
  ) => void;
  [socketEvents.getMessageHistory]: (
    payload: unknown,
    acknowledge?: (result: SocketAck<MessageHistoryResult>) => void,
  ) => void;
  [socketEvents.sendTextMessage]: (
    payload: unknown,
    acknowledge?: (result: SocketAck<{ message: TextMessageEvent; duplicate: boolean }>) => void,
  ) => void;
};

export type SocketServerEvents = {
  [socketEvents.messageCreated]: (message: TextMessageEvent) => void;
};
