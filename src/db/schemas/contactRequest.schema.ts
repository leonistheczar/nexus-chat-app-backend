import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./user.schema.js";

export const contactRequestStatus = pgEnum("contact_request_status", [
  "pending",
  "accepted",
  "rejected",
  "cancelled",
]);

export const contactRequests = pgTable(
  "contact_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    receiverId: uuid("receiver_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: contactRequestStatus("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "contact_requests_no_self_reference",
      sql`${table.senderId} <> ${table.receiverId}`,
    ),
    index("contact_requests_receiver_status_idx").on(
      table.receiverId,
      table.status,
      table.createdAt,
    ),
    index("contact_requests_sender_status_idx").on(
      table.senderId,
      table.status,
      table.createdAt,
    ),
    uniqueIndex("contact_requests_pending_pair_unique")
      .on(
        sql`least(${table.senderId}, ${table.receiverId})`,
        sql`greatest(${table.senderId}, ${table.receiverId})`,
      )
      .where(sql`${table.status} = 'pending'`),
  ],
);
