import assert from "node:assert/strict";
import test from "node:test";
import { searchUsersQuery } from "./userSearch.validation.js";

test("user search trims and lowercases a username prefix", () => {
  assert.deepEqual(searchUsersQuery.parse({ username: "  Ali_ " }), {
    username: "ali_",
  });
});

test("user search rejects short or unsupported username input", () => {
  assert.equal(searchUsersQuery.safeParse({ username: "a" }).success, false);
  assert.equal(searchUsersQuery.safeParse({ username: "ali%" }).success, false);
});
