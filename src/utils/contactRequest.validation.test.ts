import assert from "node:assert/strict";
import test from "node:test";
import {
  contactRequestIdParam,
  createContactRequestBody,
  listContactRequestsQuery,
} from "./contactRequest.validation.js";

test("contact request username is trimmed and normalized to lowercase", () => {
  assert.deepEqual(createContactRequestBody.parse({ username: "  Ali_123 " }), {
    username: "ali_123",
  });
});

test("contact request username rejects invalid formats", () => {
  assert.equal(createContactRequestBody.safeParse({ username: "ali user" }).success, false);
  assert.equal(createContactRequestBody.safeParse({ username: "short" }).success, false);
});

test("contact request ID must be a UUID", () => {
  assert.equal(contactRequestIdParam.safeParse({ requestId: "not-a-uuid" }).success, false);
  assert.equal(
    contactRequestIdParam.safeParse({ requestId: "81f7e9a2-bd72-4f6e-a046-3d6102bced99" }).success,
    true,
  );
});

test("request list supports bounded cursor pagination", () => {
  assert.deepEqual(listContactRequestsQuery.parse({}), { limit: 50 });
  assert.deepEqual(
    listContactRequestsQuery.parse({
      before: "81f7e9a2-bd72-4f6e-a046-3d6102bced99",
      limit: "25",
    }),
    { before: "81f7e9a2-bd72-4f6e-a046-3d6102bced99", limit: 25 },
  );
  assert.equal(listContactRequestsQuery.safeParse({ limit: "101" }).success, false);
});
