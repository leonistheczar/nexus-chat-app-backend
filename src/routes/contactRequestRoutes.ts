import { getAuth } from "@clerk/express";
import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import express from "express";
import * as z from "zod";
import { db } from "../db/index.js";
import { contactRequests } from "../db/schemas/contactRequest.schema.js";
import { contacts } from "../db/schemas/contacts.schema.js";
import { users } from "../db/schemas/user.schema.js";
import {
  contactRequestIdParam,
  createContactRequestBody,
  listContactRequestsQuery,
} from "../utils/contactRequest.validation.js";

const router = express.Router();
const publicUserColumns = {
  id: users.id,
  username: users.username,
  displayName: users.displayName,
  avatarUrl: users.avatarUrl,
};

async function findCurrentUser(clerkUserId: string) {
  return db.query.users.findFirst({
    where: and(
      eq(users.clerkUserId, clerkUserId),
      eq(users.profileStatus, "active"),
      isNull(users.deletedAt),
    ),
    columns: { id: true },
  });
}

router.post("/contact-requests", async (req, res, next) => {
  const auth = getAuth(req);
  if (!auth.isAuthenticated) {
    return res.status(401).json({ data: null, message: "Unauthorized" });
  }

  const input = createContactRequestBody.safeParse(req.body);
  if (!input.success) {
    return res.status(400).json({
      data: null,
      message: "Invalid username",
      errors: z.treeifyError(input.error),
    });
  }

  try {
    const sender = await findCurrentUser(auth.userId);
    if (!sender) {
      return res.status(404).json({ data: null, message: "Active profile not found" });
    }

    const [recipient] = await db
      .select(publicUserColumns)
      .from(users)
      .where(
        and(
          sql`lower(${users.username}) = ${input.data.username}`,
          eq(users.profileStatus, "active"),
          isNull(users.deletedAt),
        ),
      )
      .limit(1);
    if (!recipient) {
      return res.status(404).json({ data: null, message: "User not found" });
    }
    if (recipient.id === sender.id) {
      return res.status(409).json({ data: null, message: "You cannot add yourself" });
    }

    const existingContact = await db.query.contacts.findFirst({
      where: or(
        and(eq(contacts.userId, sender.id), eq(contacts.contactUserId, recipient.id)),
        and(eq(contacts.userId, recipient.id), eq(contacts.contactUserId, sender.id)),
      ),
      columns: { id: true },
    });
    if (existingContact) {
      return res.status(409).json({ data: null, message: "Already a contact" });
    }

    const existingRequest = await db.query.contactRequests.findFirst({
      where: and(
        eq(contactRequests.status, "pending"),
        or(
          and(
            eq(contactRequests.senderId, sender.id),
            eq(contactRequests.receiverId, recipient.id),
          ),
          and(
            eq(contactRequests.senderId, recipient.id),
            eq(contactRequests.receiverId, sender.id),
          ),
        ),
      ),
      columns: {
        id: true,
        senderId: true,
        receiverId: true,
        status: true,
        createdAt: true,
      },
    });
    if (existingRequest) {
      return res.status(409).json({
        data: {
          requestId: existingRequest.id,
          direction: existingRequest.senderId === sender.id ? "sent" : "received",
        },
        message: "A pending contact request already exists",
      });
    }

    const [createdRequest] = await db
      .insert(contactRequests)
      .values({ senderId: sender.id, receiverId: recipient.id })
      .onConflictDoNothing()
      .returning({
        id: contactRequests.id,
        status: contactRequests.status,
        createdAt: contactRequests.createdAt,
      });

    if (!createdRequest) {
      const racedRequest = await db.query.contactRequests.findFirst({
        where: and(
          eq(contactRequests.status, "pending"),
          or(
            and(
              eq(contactRequests.senderId, sender.id),
              eq(contactRequests.receiverId, recipient.id),
            ),
            and(
              eq(contactRequests.senderId, recipient.id),
              eq(contactRequests.receiverId, sender.id),
            ),
          ),
        ),
        columns: { id: true, senderId: true },
      });
      return res.status(409).json({
        data: racedRequest
          ? {
              requestId: racedRequest.id,
              direction: racedRequest.senderId === sender.id ? "sent" : "received",
            }
          : null,
        message: "A pending contact request already exists",
      });
    }

    return res.status(201).json({
      data: {
        ...createdRequest,
        recipient: {
          username: recipient.username,
          displayName: recipient.displayName,
          avatarUrl: recipient.avatarUrl,
        },
      },
      message: "Contact request sent",
    });
  } catch (err) {
    next(err);
  }
});

async function listRequests(req: express.Request, res: express.Response, next: express.NextFunction, direction: "received" | "sent") {
  const auth = getAuth(req);
  if (!auth.isAuthenticated) {
    return res.status(401).json({ data: null, message: "Unauthorized" });
  }

  try {
    const user = await findCurrentUser(auth.userId);
    if (!user) {
      return res.status(404).json({ data: null, message: "Active profile not found" });
    }

    const query = listContactRequestsQuery.safeParse(req.query);
    if (!query.success) {
      return res.status(400).json({
        data: null,
        message: "Invalid pagination parameters",
        errors: z.treeifyError(query.error),
      });
    }
    const ownerColumn = direction === "received" ? contactRequests.receiverId : contactRequests.senderId;
    const conditions = [
      eq(ownerColumn, user.id),
      eq(contactRequests.status, "pending"),
    ];
    if (query.data.before) {
      const cursor = await db.query.contactRequests.findFirst({
        where: and(
          eq(contactRequests.id, query.data.before),
          eq(ownerColumn, user.id),
          eq(contactRequests.status, "pending"),
        ),
        columns: { id: true, createdAt: true },
      });
      if (!cursor) {
        return res.status(400).json({ data: null, message: "Invalid request cursor" });
      }
      conditions.push(
        or(
          lt(contactRequests.createdAt, cursor.createdAt),
          and(
            eq(contactRequests.createdAt, cursor.createdAt),
            lt(contactRequests.id, cursor.id),
          ),
        )!,
      );
    }

    const records = await db.query.contactRequests.findMany({
      where: and(...conditions),
      orderBy: [desc(contactRequests.createdAt), desc(contactRequests.id)],
      limit: query.data.limit,
      columns: {
        id: true,
        senderId: true,
        receiverId: true,
        status: true,
        createdAt: true,
      },
    });
    const otherUserIds = records.map((request) =>
      direction === "received" ? request.senderId : request.receiverId,
    );
    const otherUsers = otherUserIds.length
      ? await db
          .select(publicUserColumns)
          .from(users)
          .where(
            and(
              inArray(users.id, otherUserIds),
              eq(users.profileStatus, "active"),
              isNull(users.deletedAt),
            ),
          )
      : [];
    const usersById = new Map(otherUsers.map((user) => [user.id, user]));

    return res.status(200).json({
      data: records.map((request) => ({
        id: request.id,
        status: request.status,
        createdAt: request.createdAt,
        user: usersById.get(direction === "received" ? request.senderId : request.receiverId) ?? null,
      })),
      nextCursor:
        records.length === query.data.limit ? records[records.length - 1]?.id ?? null : null,
    });
  } catch (err) {
    next(err);
  }
}

router.get("/contact-requests/received", (req, res, next) =>
  listRequests(req, res, next, "received"),
);
router.get("/contact-requests/sent", (req, res, next) =>
  listRequests(req, res, next, "sent"),
);

router.patch("/contact-requests/:requestId/accept", async (req, res, next) => {
  const auth = getAuth(req);
  if (!auth.isAuthenticated) {
    return res.status(401).json({ data: null, message: "Unauthorized" });
  }
  const params = contactRequestIdParam.safeParse(req.params);
  if (!params.success) {
    return res.status(400).json({ data: null, message: "Invalid request ID" });
  }

  try {
    const user = await findCurrentUser(auth.userId);
    if (!user) {
      return res.status(404).json({ data: null, message: "Active profile not found" });
    }

    const [updatedRequests] = await db.batch([
      db
        .update(contactRequests)
        .set({ status: "accepted", respondedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(contactRequests.id, params.data.requestId),
            eq(contactRequests.receiverId, user.id),
            eq(contactRequests.status, "pending"),
          ),
        )
        .returning({
          id: contactRequests.id,
          senderId: contactRequests.senderId,
          receiverId: contactRequests.receiverId,
          status: contactRequests.status,
        }),
      db
        .insert(contacts)
        .select(
          db
            .select({
              userId: contactRequests.receiverId,
              contactUserId: contactRequests.senderId,
            })
            .from(contactRequests)
            .where(
              and(
                eq(contactRequests.id, params.data.requestId),
                eq(contactRequests.receiverId, user.id),
                eq(contactRequests.status, "accepted"),
              ),
            ),
        )
        .onConflictDoNothing(),
      db
        .insert(contacts)
        .select(
          db
            .select({
              userId: contactRequests.senderId,
              contactUserId: contactRequests.receiverId,
            })
            .from(contactRequests)
            .where(
              and(
                eq(contactRequests.id, params.data.requestId),
                eq(contactRequests.receiverId, user.id),
                eq(contactRequests.status, "accepted"),
              ),
            ),
        )
        .onConflictDoNothing(),
    ]);

    if (!updatedRequests[0]) {
      return res.status(409).json({
        data: null,
        message: "Request not found, not pending, or not addressed to you",
      });
    }
    return res.status(200).json({
      data: { id: updatedRequests[0].id, status: updatedRequests[0].status },
      message: "Contact request accepted",
    });
  } catch (err) {
    next(err);
  }
});

router.patch("/contact-requests/:requestId/reject", async (req, res, next) => {
  const auth = getAuth(req);
  if (!auth.isAuthenticated) {
    return res.status(401).json({ data: null, message: "Unauthorized" });
  }
  const params = contactRequestIdParam.safeParse(req.params);
  if (!params.success) {
    return res.status(400).json({ data: null, message: "Invalid request ID" });
  }

  try {
    const user = await findCurrentUser(auth.userId);
    if (!user) {
      return res.status(404).json({ data: null, message: "Active profile not found" });
    }
    const [updatedRequest] = await db
      .update(contactRequests)
      .set({ status: "rejected", respondedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(contactRequests.id, params.data.requestId),
          eq(contactRequests.receiverId, user.id),
          eq(contactRequests.status, "pending"),
        ),
      )
      .returning({ id: contactRequests.id, status: contactRequests.status });

    if (!updatedRequest) {
      return res.status(409).json({
        data: null,
        message: "Request not found, not pending, or not addressed to you",
      });
    }
    return res.status(200).json({
      data: updatedRequest,
      message: "Contact request rejected",
    });
  } catch (err) {
    next(err);
  }
});

router.patch("/contact-requests/:requestId/cancel", async (req, res, next) => {
  const auth = getAuth(req);
  if (!auth.isAuthenticated) {
    return res.status(401).json({ data: null, message: "Unauthorized" });
  }
  const params = contactRequestIdParam.safeParse(req.params);
  if (!params.success) {
    return res.status(400).json({ data: null, message: "Invalid request ID" });
  }

  try {
    const user = await findCurrentUser(auth.userId);
    if (!user) {
      return res.status(404).json({ data: null, message: "Active profile not found" });
    }
    const cancelledAt = new Date();
    const [updatedRequest] = await db
      .update(contactRequests)
      .set({ status: "cancelled", respondedAt: cancelledAt, updatedAt: cancelledAt })
      .where(
        and(
          eq(contactRequests.id, params.data.requestId),
          eq(contactRequests.senderId, user.id),
          eq(contactRequests.status, "pending"),
        ),
      )
      .returning({ id: contactRequests.id, status: contactRequests.status });

    if (!updatedRequest) {
      return res.status(409).json({
        data: null,
        message: "Request not found, not pending, or not sent by you",
      });
    }
    return res.status(200).json({
      data: updatedRequest,
      message: "Contact request cancelled",
    });
  } catch (err) {
    next(err);
  }
});

export default router;
