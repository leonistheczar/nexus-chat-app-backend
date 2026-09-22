import { sql } from "drizzle-orm";
import {
    check,
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
        username: varchar("username", { length: 20 }),
        firstName: varchar("first_name", { length: 80 }),
        lastName: varchar("last_name", { length: 80 }),
        displayName: varchar("display_name", { length: 161 }),
        phoneE164: varchar("phone_e164", { length: 16 }),
        avatarUrl: text("avatar_url"),
        profileStatus: userProfileStatus("profile_status")
            .notNull()
            .default("incomplete"),
        lastSeenAt: timestamp("last_seen_at", {
            withTimezone: true,
        }),
        createdAt: timestamp("created_at", { withTimezone: true })
            .defaultNow()
            .notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
            .defaultNow()
            .notNull(),
        deletedAt: timestamp("deleted_at", { withTimezone: true }),
        profileVersion: integer("profile_version").notNull().default(1),
    },
    (table) => [
        uniqueIndex("users_username_lower_unique").on(
            sql`lower(${table.username})`,
        ),
        uniqueIndex("users_phone_e164_unique")
            .on(table.phoneE164)
            .where(sql`${table.phoneE164} is not null`),
        index("users_profile_status_idx").on(table.profileStatus),
        index("users_last_seen_at_idx").on(table.lastSeenAt),
        check(
            "users_active_profile_complete",
            sql`${table.profileStatus} <> 'active' OR (
                ${table.username} is not null
                AND ${table.firstName} is not null
                AND ${table.lastName} is not null
                AND ${table.displayName} is not null
            )`,
        ),
    ],
);
