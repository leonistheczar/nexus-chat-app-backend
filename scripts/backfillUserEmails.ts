/**
 * Backfills the nullable `users.email` column for existing Nexus users.
 *
 * The email column was added after user records already existed, so those rows
 * start with `NULL`. This one-time script matches each row to its Clerk account
 * using `clerk_user_id`, then copies the account's verified primary email.
 * Users without a verified primary email are left unchanged for a later update.
 *
 * Run with `pnpm db:backfill-emails` after the email column migration has been
 * applied. The command needs `DATABASE_URL` and `CLERK_SECRET_KEY` in the
 * environment. It only updates rows whose email is still `NULL`, so it is safe
 * to rerun; emails are normalized to lowercase. The script reports counts and
 * does not print email addresses.
 */
import "dotenv/config";
import { createClerkClient } from "@clerk/express";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../src/db/index.js";
import { users } from "../src/db/schemas/user.schema.js";

const clerkSecretKey = process.env.CLERK_SECRET_KEY;

if (!clerkSecretKey) {
  throw new Error("CLERK_SECRET_KEY is required to backfill user emails");
}

const clerk = createClerkClient({ secretKey: clerkSecretKey });

async function backfillUserEmails() {
  const usersWithoutEmail = await db
    .select({ id: users.id, clerkUserId: users.clerkUserId })
    .from(users)
    .where(isNull(users.email));

  let updatedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const [index, user] of usersWithoutEmail.entries()) {
    try {
      const clerkUser = await clerk.users.getUser(user.clerkUserId);
      const primaryEmail = clerkUser.primaryEmailAddress;

      if (
        !primaryEmail ||
        primaryEmail.verification?.status !== "verified" ||
        !primaryEmail.emailAddress.trim()
      ) {
        skippedCount += 1;
        continue;
      }

      const updatedRows = await db
        .update(users)
        .set({ email: primaryEmail.emailAddress.trim().toLowerCase() })
        .where(and(eq(users.id, user.id), isNull(users.email)))
        .returning({ id: users.id });

      if (updatedRows.length > 0) {
        updatedCount += 1;
      } else {
        skippedCount += 1;
      }
    } catch (error) {
      failedCount += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `Could not backfill user ${index + 1} of ${usersWithoutEmail.length}: ${message}`,
      );
    }
  }

  console.info(
    `Email backfill finished. Updated: ${updatedCount}; skipped: ${skippedCount}; failed: ${failedCount}.`,
  );

  if (failedCount > 0) {
    process.exitCode = 1;
  }
}

backfillUserEmails().catch((error: unknown) => {
  console.error("Email backfill could not complete:", error);
  process.exitCode = 1;
});
