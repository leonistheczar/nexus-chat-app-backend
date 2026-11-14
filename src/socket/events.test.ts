import assert from "node:assert/strict";
import test from "node:test";
import {
  messageHistoryPayload,
  sendTextMessagePayload,
} from "./events.js";
import { getAllowedFrontendOrigins, isAllowedFrontendOrigin } from "./config.js";

const conversationId = "81f7e9a2-bd72-4f6e-a046-3d6102bced99";
const firstOperationId = "2d13aa6a-f2b2-45d8-a967-91a17a38f1b0";
const retryOperationId = "c4da5e87-09ca-4af7-82ee-8380ce2658d8";

test("history request defaults to a bounded page size", () => {
  assert.deepEqual(messageHistoryPayload.parse({ conversationId }), {
    conversationId,
    limit: 50,
  });
  assert.equal(
    messageHistoryPayload.safeParse({ conversationId, limit: 101 }).success,
    false,
  );
});

test("text sends require a valid operation ID and non-empty bounded body", () => {
  assert.equal(
    sendTextMessagePayload.safeParse({
      conversationId,
      operationId: firstOperationId,
      body: "  hello  ",
    }).success,
    true,
  );
  assert.equal(
    sendTextMessagePayload.safeParse({
      conversationId,
      operationId: "invalid",
      body: "hello",
    }).success,
    false,
  );
  assert.equal(
    sendTextMessagePayload.safeParse({
      conversationId,
      operationId: firstOperationId,
      body: "   ",
    }).success,
    false,
  );
});

test("identical text with distinct operation IDs remains valid", () => {
  for (const operationId of [firstOperationId, retryOperationId]) {
    assert.equal(
      sendTextMessagePayload.safeParse({
        conversationId,
        operationId,
        body: "same content is allowed for separate sends",
      }).success,
      true,
    );
  }
});

test("frontend origin allowlist rejects malformed and unconfigured origins", () => {
  const previousOrigins = process.env.FRONTEND_ORIGINS;
  delete process.env.FRONTEND_ORIGINS;
  try {
    assert.deepEqual(getAllowedFrontendOrigins(), ["http://localhost:3000"]);
    assert.equal(isAllowedFrontendOrigin("http://localhost:3000"), true);
    assert.equal(isAllowedFrontendOrigin("https://untrusted.example"), false);
    assert.equal(isAllowedFrontendOrigin("not-an-origin"), false);
  } finally {
    if (previousOrigins === undefined) delete process.env.FRONTEND_ORIGINS;
    else process.env.FRONTEND_ORIGINS = previousOrigins;
  }
});
