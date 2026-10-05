import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { conversations } from "./conversation.schema.js";
import { users } from "./user.schema.js";

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),

    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    body: text("body"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),

    editedAt: timestamp("edited_at", { withTimezone: true }),

    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("messages_conversation_created_id_idx").on(
      table.conversationId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
  ],
);

export const messageAttachments = pgTable(
  "message_attachments",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),

    storageKey: text("storage_key").notNull(),

    mediaType: varchar("media_type", { length: 255 }).notNull(),

    originalFileName: varchar("original_file_name", { length: 255 }),

    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("message_attachments_storage_key_unique").on(table.storageKey),
    index("message_attachments_message_id_idx").on(table.messageId),
    check("message_attachments_size_non_negative", sql`${table.sizeBytes} >= 0`),
  ],
);
