import { pgTable, text, timestamp } from "drizzle-orm/pg-core"

export const users = pgTable("users", {
    id: text("id").primaryKey(),
    clerkUserId: text("clerkUserId").unique().notNull(),
    userName: text("userName").unique().notNull(),
    displayName: text("displayName").notNull(),
    phone: text("phone").unique(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
})