import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { contacts } from "./schemas/contacts.schema.js";
import {
  conversationParticipants,
  conversations,
} from "./schemas/conversation.schema.js";
import { messageAttachments, messages } from "./schemas/message.schema.js";
import { users } from "./schemas/user.schema.js";

const DATABASE_URL = process.env.DATABASE_URL;
if(!DATABASE_URL) throw new Error("DATABASE_URL not configured");
const sql = neon(process.env.DATABASE_URL!);

export const db = drizzle({
    client: sql,
    schema: {
      users,
      contacts,
      conversations,
      conversationParticipants,
      messages,
      messageAttachments,
    },
})
