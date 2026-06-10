import { test } from "node:test";
import assert from "node:assert/strict";
import { VOICES, DEFAULT_VOICE_KEY, isVoiceKey } from "./voices.ts";
import { audioBase, mp3Url, cueUrl } from "./audio-paths.ts";

test("VOICES has the three expected keys with the default first", () => {
  assert.deepEqual(
    VOICES.map((v) => v.key),
    ["sonia", "ryan", "libby"],
  );
  assert.equal(DEFAULT_VOICE_KEY, "sonia");
  assert.equal(VOICES[0].id, "en-GB-SoniaNeural");
});

test("isVoiceKey accepts known keys and rejects others", () => {
  assert.equal(isVoiceKey("ryan"), true);
  assert.equal(isVoiceKey("daniel"), false);
  assert.equal(isVoiceKey(""), false);
});

test("audio path helpers build voice-keyed urls", () => {
  assert.equal(audioBase("ryan", 2, 0, 1, 3), "audio/ryan/2_0_1_3");
  assert.equal(mp3Url("sonia", 0, 0, 0, 0), "audio/sonia/0_0_0_0.mp3");
  assert.equal(cueUrl("libby", 1, 2, 0, 4), "audio/libby/1_2_0_4.mp3.json");
});
