import { getAuth } from "@clerk/express";
import { and, eq, isNull, sql } from "drizzle-orm";
import express from "express";
import * as z from "zod";
import { db } from "../db/index.js";
import { users } from "../db/schemas/user.schema.js";
import { searchUsersQuery } from "../utils/userSearch.validation.js";

export type PublicUserSearchResult = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

type SearchResult =
  | { kind: "profile_not_found" }
  | { kind: "results"; users: PublicUserSearchResult[] };

type SearchAuth = { isAuthenticated: boolean; userId: string | null };

export type UserSearchRouteDependencies = {
  getAuth: (req: express.Request) => SearchAuth;
  searchUsers: (clerkUserId: string, usernamePrefix: string) => Promise<SearchResult>;
};

async function searchActiveUsers(
  clerkUserId: string,
  usernamePrefix: string,
): Promise<SearchResult> {
  const currentUser = await db.query.users.findFirst({
    where: and(
      eq(users.clerkUserId, clerkUserId),
      eq(users.profileStatus, "active"),
      isNull(users.deletedAt),
    ),
    columns: { id: true },
  });
  if (!currentUser) return { kind: "profile_not_found" };

  // The allowed username alphabet is ASCII letters, digits, and underscores.
  // '{' sorts after those characters, making this a prefix range on the existing
  // lower(username) B-tree index.
  const upperBound = `${usernamePrefix}{`;
  const matches = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(
      and(
        sql`lower(${users.username}) >= ${usernamePrefix}`,
        sql`lower(${users.username}) < ${upperBound}`,
        eq(users.profileStatus, "active"),
        isNull(users.deletedAt),
        sql`${users.id} <> ${currentUser.id}`,
      ),
    )
    .orderBy(users.username)
    .limit(10);

  return { kind: "results", users: matches };
}

export function createUserSearchRouter(dependencies: UserSearchRouteDependencies) {
  const router = express.Router();

  router.get("/users/search", async (req, res, next) => {
    const auth = dependencies.getAuth(req);
    if (!auth.isAuthenticated || !auth.userId) {
      return res.status(401).json({ data: null, message: "Unauthorized" });
    }

    const query = searchUsersQuery.safeParse(req.query);
    if (!query.success) {
      return res.status(400).json({
        data: null,
        message: "Enter at least 2 valid username characters",
        errors: z.treeifyError(query.error),
      });
    }

    try {
      const result = await dependencies.searchUsers(auth.userId, query.data.username);
      if (result.kind === "profile_not_found") {
        return res.status(404).json({ data: null, message: "Active profile not found" });
      }
      if (result.users.length === 0) {
        return res.status(200).json({
          data: [],
          message: "No users found matching that username",
        });
      }
      return res.status(200).json({ data: result.users, message: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

const userSearchRouter = createUserSearchRouter({
  getAuth: (req) => {
    const auth = getAuth(req);
    return { isAuthenticated: auth.isAuthenticated, userId: auth.userId };
  },
  searchUsers: searchActiveUsers,
});

export default userSearchRouter;
