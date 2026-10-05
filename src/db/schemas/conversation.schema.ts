import { sql } from "drizzle-orm";
import {
  index,
  pgEnum,
  pgTable,
  primaryKey,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./user.schema.js";

export const conversationKind = pgEnum("conversation_kind", [
  "self",
  "direct",
  "group",
]);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    kind: conversationKind("kind").notNull(),

    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),

    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("conversations_one_self_per_user_unique")
      .on(table.createdByUserId)
      .where(sql`${table.kind} = 'self'`),
  ],
);

export const conversationParticipants = pgTable(
  "conversation_participants",
  {
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),

    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    joinedAt: timestamp("joined_at", { withTimezone: true })
      .defaultNow()
      .notNull(),

    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({
      name: "conversation_participants_pk",
      columns: [table.conversationId, table.userId],
    }),
    index("conversation_participants_user_idx").on(table.userId),
  ],
);
