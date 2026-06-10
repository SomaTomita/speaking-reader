import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeVoiceKey } from "./settings.ts";

test("normalizeVoiceKey keeps a valid key", () => {
  assert.equal(normalizeVoiceKey("ryan"), "ryan");
});

test("normalizeVoiceKey falls back to default for unknown/legacy values", () => {
  assert.equal(normalizeVoiceKey("Daniel"), "sonia"); // legacy Web Speech name
  assert.equal(normalizeVoiceKey(undefined), "sonia");
  assert.equal(normalizeVoiceKey(""), "sonia");
});
