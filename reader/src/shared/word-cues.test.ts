import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWordUnits, activeCueIndex, type WordCue } from "./word-cues.ts";

const CUES: WordCue[] = [
  { part: "The ", start: 0, end: 200 },
  { part: "quick ", start: 200, end: 500 },
  { part: "fox.", start: 500, end: 900 },
];

test("buildWordUnits splits trailing whitespace out of the word", () => {
  const units = buildWordUnits(CUES);
  assert.equal(units.length, 3);
  assert.deepEqual(units[0], { word: "The", trailing: " ", start: 0, end: 200 });
  assert.deepEqual(units[2], { word: "fox.", trailing: "", start: 500, end: 900 });
});

test("buildWordUnits reproduces the original text when re-joined", () => {
  const units = buildWordUnits(CUES);
  const rejoined = units.map((u) => u.word + u.trailing).join("");
  assert.equal(rejoined, "The quick fox.");
});

test("activeCueIndex returns -1 before the first word starts", () => {
  assert.equal(activeCueIndex(CUES, -5), -1);
});

test("activeCueIndex returns the word whose start has been reached", () => {
  assert.equal(activeCueIndex(CUES, 0), 0);
  assert.equal(activeCueIndex(CUES, 250), 1);
  assert.equal(activeCueIndex(CUES, 700), 2);
});

test("activeCueIndex stays on the last word after it starts", () => {
  assert.equal(activeCueIndex(CUES, 99999), 2);
});

test("activeCueIndex handles empty cues", () => {
  assert.equal(activeCueIndex([], 100), -1);
});
