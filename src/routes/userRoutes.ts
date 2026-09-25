import { clerkClient, getAuth } from "@clerk/express";
import express from "express";
import { db } from "../db/index.js";
import { users } from "../db/schemas/user.schema.js";
import { eq } from "drizzle-orm";
const router = express.Router();

// GET
// @route   GET api/v1/users/me
// @desc    Check for the requested user
// @access  Private
router.get("/users/me", async (req, res, next) => {
  const auth = getAuth(req);
  if (!auth.isAuthenticated) {
    return res.status(401).json({
      data: {
        message: "Not authorized",
      },
    });   
  }
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.clerkUserId, auth.userId),
    });
    if (!user) {
      return res.status(404).json({
        data: {
          message: "Not Found - Nexus",
        },
      });
    }
    return res.status(200).json({ data: { user } });
  } catch (err) {
    next(err);
  }
});
export default router;
