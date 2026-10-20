import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import type { UserSearchRouteDependencies } from "./userSearchRoutes.js";

process.env.DATABASE_URL ??= "postgresql://test:test@localhost/test";
const { createUserSearchRouter } = await import("./userSearchRoutes.js");

const sampleUser = {
  id: "81f7e9a2-bd72-4f6e-a046-3d6102bced99",
  username: "alice_2",
  displayName: "Alice Example",
  avatarUrl: null,
};

async function withSearchEndpoint(
  dependencies: UserSearchRouteDependencies,
  run: (url: string) => Promise<void>,
) {
  const app = express();
  app.use(createUserSearchRouter(dependencies));
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;

  try {
    await run(`http://127.0.0.1:${address.port}/users/search`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

function dependencies(
  searchUsers: UserSearchRouteDependencies["searchUsers"],
  authenticated = true,
): UserSearchRouteDependencies {
  return {
    getAuth: () => ({
      isAuthenticated: authenticated,
      userId: authenticated ? "clerk-user-1" : null,
    }),
    searchUsers,
  };
}

test("user search endpoint rejects unauthenticated requests", async () => {
  let searchCalled = false;
  await withSearchEndpoint(
    dependencies(async () => {
      searchCalled = true;
      return { kind: "results", users: [sampleUser] };
    }, false),
    async (url) => {
      const response = await fetch(`${url}?username=al`);
      assert.equal(response.status, 401);
      assert.equal(searchCalled, false);
    },
  );
});

test("user search endpoint validates the prefix before querying", async () => {
  let searchCalled = false;
  await withSearchEndpoint(
    dependencies(async () => {
      searchCalled = true;
      return { kind: "results", users: [] };
    }),
    async (url) => {
      const response = await fetch(`${url}?username=a`);
      const body = await response.json();
      assert.equal(response.status, 400);
      assert.match(body.message, /at least 2/);
      assert.equal(searchCalled, false);
    },
  );
});

test("user search endpoint returns matching public profiles", async () => {
  let searchArgs: [string, string] | undefined;
  await withSearchEndpoint(
    dependencies(async (clerkUserId, prefix) => {
      searchArgs = [clerkUserId, prefix];
      return { kind: "results", users: [sampleUser] };
    }),
    async (url) => {
      const response = await fetch(`${url}?username=%20AL%20`);
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.deepEqual(body, { data: [sampleUser], message: null });
      assert.deepEqual(searchArgs, ["clerk-user-1", "al"]);
    },
  );
});

test("user search endpoint returns an explicit message when there are no matches", async () => {
  await withSearchEndpoint(
    dependencies(async () => ({ kind: "results", users: [] })),
    async (url) => {
      const response = await fetch(`${url}?username=zz`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        data: [],
        message: "No users found matching that username",
      });
    },
  );
});

test("user search endpoint reports a missing local profile", async () => {
  await withSearchEndpoint(
    dependencies(async () => ({ kind: "profile_not_found" })),
    async (url) => {
      const response = await fetch(`${url}?username=al`);
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), {
        data: null,
        message: "Active profile not found",
      });
    },
  );
});
