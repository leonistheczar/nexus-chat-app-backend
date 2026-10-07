import { clerkClient, getAuth } from "@clerk/express";
import { randomUUID } from "node:crypto";
import express from "express";
import { db } from "../db/index.js";
import {
  conversationParticipants,
  conversations,
} from "../db/schemas/conversation.schema.js";
import { users } from "../db/schemas/user.schema.js";
import { and, eq, sql } from "drizzle-orm";
import { userValidation } from "../utils/user.validation.schema.js";
import * as z from "zod";
const router = express.Router();

// GET
// @route   GET api/v1/users/me
// @desc    Check for the requested user
// @access  Private
router.get("/users/me", async (req, res, next) => {
  const auth = getAuth(req);
  if (!auth.isAuthenticated) {
    return res.status(401).json({
      data: null,
      message: "Not authorized",
    });
  }
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.clerkUserId, auth.userId),
    });
    if (!user) {
      return res.status(404).json({
        data: null,
        message: "Not Found - Nexus",
      });
    }
    const selfConversation = await db.query.conversations.findFirst({
      where: and(
        eq(conversations.createdByUserId, user.id),
        eq(conversations.kind, "self"),
      ),
      columns: { id: true, lastMessageAt: true },
    });
    return res.status(200).json({
      data: {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        displayName: user.displayName,
        phone_e164: user.phoneE164,
        avatarUrl: user.avatarUrl,
        profileStatus: user.profileStatus,
        lastSeenAt: user.lastSeenAt,
      },
      selfChat: selfConversation
        ? { id: selfConversation.id, lastMessageAt: selfConversation.lastMessageAt }
        : null,
    });
  } catch (err) {
    next(err);
  }
});
// POST
// @route   POST api/v1/users/me/create
// @desc    Create the user for the platform (new)
// @access  Private
router.post("/users/me/create", async (req, res, next) => {
  const auth = getAuth(req);
  if (!auth.isAuthenticated) {
    return res.status(401).json({ data: null, message: "Unauthorized" });
  }
  const { firstName, lastName, phone_e164, displayName, username } = req.body;
  const profileData = {
    firstName,
    lastName,
    phoneE164: phone_e164,
    username,
    displayName,
  };
  const profileResult = userValidation
    .omit({ email: true })
    .safeParse(profileData);
  if (!profileResult.success) {
    return res.status(400).json({
      data: null,
      message: "Invalid profile data",
      errors: z.treeifyError(profileResult.error),
    });
  }
  const checkUsername = profileResult.data.username.toLowerCase();

  try {
    // Existing user checks
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.clerkUserId, auth.userId))
      .limit(1);
    if (existingUser.length > 0) {
      return res
        .status(409)
        .json({ data: null, message: "User profile already exists" });
    }

    // Existing username checks
    const existingUsername = await db
      .select()
      .from(users)
      .where(sql`lower(${users.username}) = ${checkUsername}`);
    if (existingUsername.length > 0) {
      return res
        .status(409)
        .json({ data: null, message: "Username already exists" });
    }

    const clerkUser = await clerkClient.users.getUser(auth.userId);
    const primaryEmail = clerkUser.primaryEmailAddress;

    if (
      !primaryEmail ||
      primaryEmail.verification?.status !== "verified"
    ) {
      return res.status(422).json({
        data: null,
        message: "A verified primary email is required to create a profile",
      });
    }

    const email = primaryEmail.emailAddress.trim().toLowerCase();
    const result = userValidation.safeParse({
      ...profileResult.data,
      email,
    });

    if (!result.success) {
      return res.status(422).json({
        data: null,
        message: "Clerk returned an invalid primary email",
      });
    }

    // Neon HTTP batches run as a transaction, so a completed profile cannot
    // be committed without its self-chat and participant membership.
    const userId = randomUUID();
    const conversationId = randomUUID();
    const [createdUsers, createdConversations] = await db.batch([
      db
        .insert(users)
        .values({
          id: userId,
          clerkUserId: auth.userId,
          username: checkUsername,
          firstName: result.data.firstName,
          lastName: result.data.lastName,
          email: result.data.email,
          phoneE164: result.data.phoneE164,
          displayName: result.data.displayName,
          profileStatus: "active",
        })
        .returning({
          id: users.id,
          email: users.email,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          profileStatus: users.profileStatus,
        }),
      db
        .insert(conversations)
        .values({
          id: conversationId,
          kind: "self",
          createdByUserId: userId,
        })
        .returning({
          id: conversations.id,
          lastMessageAt: conversations.lastMessageAt,
        }),
      db.insert(conversationParticipants).values({
        conversationId,
        userId,
      }),
    ]);
    const user = createdUsers[0];
    const selfConversation = createdConversations[0];

    if (!user || !selfConversation) {
      throw new Error("Failed to create user profile and self-chat");
    }

    return res
      .status(201)
      .json({
        data: user,
        selfChat: selfConversation,
        message: "Profile successfully created",
      });
  } catch (err) {
    const databaseError = err as {
      code?: unknown;
      constraint?: unknown;
    };

    // Pre-checks can race; database uniqueness constraints are authoritative.
    if (databaseError.code === "23505") {
      const constraint = String(databaseError.constraint ?? "");
      const message = constraint.includes("username")
        ? "Username already exists"
        : constraint.includes("email")
          ? "Email already exists"
          : constraint.includes("phone")
            ? "Phone number already exists"
            : "User profile already exists";

      return res.status(409).json({ data: null, message });
    }

    next(err);
  }
});

export default router;
