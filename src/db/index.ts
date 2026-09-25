import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { users } from "./schemas/user.schema.js";

const DATABASE_URL = process.env.DATABASE_URL;
if(!DATABASE_URL) throw new Error("DATABASE_URL not configured");
const sql = neon(process.env.DATABASE_URL!);

export const db = drizzle({
    client: sql,
    schema: {users}
})