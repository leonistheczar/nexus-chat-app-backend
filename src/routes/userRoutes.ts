import { getAuth } from "@clerk/express";
import express from "express";
import { db } from "../db/index.js";
import { users } from "../db/schemas/user.schema.js";
import { eq, sql } from "drizzle-orm";
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
    return res.status(200).json({ data: user });
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
  const { firstName, lastName, phoneE164, displayName, username } = req.body;
  const profileData = {
    firstName,
    lastName,
    phoneE164,
    username,
    displayName,
  };
  const result = userValidation.safeParse(profileData);
  if (!result.success) {
    return res.status(400).json({
      data: null,
      message: "Invalid profile data",
      errors: z.treeifyError(result.error),
    });
  }
  const checkUsername = result.data.username.toLowerCase();

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

    // Insertion into "users"
    const [user] = await db
      .insert(users)
      .values({
        clerkUserId: auth.userId,
        username: checkUsername,
        firstName: result.data.firstName,
        lastName: result.data.lastName,
        phoneE164: result.data.phoneE164,
        displayName: result.data.displayName,
        profileStatus: "active",
      })
      .returning();
    return res
      .status(201)
      .json({ data: user, message: "Profile successfully created" });
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
        : constraint.includes("phone")
          ? "Phone number already exists"
          : "User profile already exists";

      return res.status(409).json({ data: null, message });
    }

    next(err);
  }
});

export default router;
