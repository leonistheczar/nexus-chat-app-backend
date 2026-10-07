import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const userProfileStatus = pgEnum("user_profile_status", [
  "incomplete",
  "active",
  "suspended",
  "deleted",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    clerkUserId: varchar("clerk_user_id", { length: 255 }).notNull().unique(),

    username: varchar("username", { length: 20 }).notNull(),

    email: varchar("email", {length: 255}).notNull().unique(),

    firstName: varchar("first_name", { length: 80 }).notNull(),

    lastName: varchar("last_name", { length: 80 }),

    displayName: varchar("display_name", { length: 161 }).notNull(),

    phoneE164: varchar("phone_e164", { length: 16 }).notNull(),

    avatarUrl: text("avatar_url"),

    profileStatus: userProfileStatus("profile_status")
      .notNull()
      .default("incomplete"),

    lastSeenAt: timestamp("last_seen_at", {
      withTimezone: true,
    }),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),

    deletedAt: timestamp("deleted_at", {
      withTimezone: true,
    }),

    profileVersion: integer("profile_version").notNull().default(1),
  },
  (table) => [
    uniqueIndex("users_username_lower_unique").on(
      sql`lower(${table.username})`,
    ),

    uniqueIndex("users_phone_e164_unique").on(table.phoneE164),

    index("users_profile_status_idx").on(table.profileStatus),

    index("users_last_seen_at_idx").on(table.lastSeenAt),
  ],
);
