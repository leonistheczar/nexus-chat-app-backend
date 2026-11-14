import { verifyToken } from "@clerk/backend";
import { and, eq, isNull } from "drizzle-orm";
import type { Socket } from "socket.io";
import { db } from "../db/index.js";
import { users } from "../db/schemas/user.schema.js";
import { getAllowedFrontendOrigins, isAllowedFrontendOrigin } from "./config.js";
import type { SocketClientEvents, SocketServerEvents } from "./events.js";

export type AuthenticatedSocketData = {
  userId: string;
  clerkUserId: string;
  authExpiresAt: number;
};

export type AuthenticatedSocket = Socket<
  SocketClientEvents,
  SocketServerEvents,
  Record<string, never>,
  AuthenticatedSocketData
>;

export async function authenticateSocket(socket: AuthenticatedSocket): Promise<void> {
  const sessionToken = socket.handshake.auth?.sessionToken;
  const secretKey = process.env.CLERK_SECRET_KEY;
  const origin = socket.handshake.headers.origin;
  const allowedOrigins = getAllowedFrontendOrigins();

  if (
    typeof sessionToken !== "string" ||
    sessionToken.length === 0 ||
    sessionToken.length > 8_192 ||
    !secretKey ||
    !isAllowedFrontendOrigin(origin)
  ) {
    throw new Error("Unauthorized");
  }

  const claims = await verifyToken(sessionToken, {
    secretKey,
    authorizedParties: allowedOrigins,
  });
  if (
    typeof claims.sub !== "string" ||
    claims.sub.length === 0 ||
    typeof claims.exp !== "number"
  ) {
    throw new Error("Unauthorized");
  }

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.clerkUserId, claims.sub),
        eq(users.profileStatus, "active"),
        isNull(users.deletedAt),
      ),
    )
    .limit(1);

  if (!user) throw new Error("Unauthorized");
  socket.data.userId = user.id;
  socket.data.clerkUserId = claims.sub;
  socket.data.authExpiresAt = claims.exp * 1_000;
}
