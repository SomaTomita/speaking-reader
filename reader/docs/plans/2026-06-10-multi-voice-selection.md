# Multi-Voice Selection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the voice picker switch between three real pre-generated en-GB voices (Sonia ♀ default, Ryan ♂, Libby ♀), with the word-by-word highlight intact for every voice.

**Architecture:** Audio is stored per voice under `public/audio/{voiceKey}/`. A single shared `VOICES` list is the source of truth for both the build and the app. The build loops the voices through edge-tts; the picker lists those voices and switching one changes the audio + cue URL prefix. Web Speech is demoted to a silent fallback only. Sentence/word counts are text-driven, so the manifest's `segments` counts are shared across voices; only audio + cue *timings* differ.

**Tech Stack:** TypeScript (ES modules), esbuild, tsx, `node-edge-tts` (build-time), Node 22 `node:test`. No new runtime deps.

**Design doc:** `docs/plans/2026-06-10-voice-selection-design.md`

---

## Conventions for the implementer

- All paths relative to `reader/`. Run commands from there.
- Not a git repo: where a step says "Commit", instead pause for review (or `git init` first).
- Generated/regenerated, do NOT hand-edit: `public/data.js`, `public/app.js`, `public/audio-manifest.json`, `public/audio/**`.
- After `src/app/*.ts` changes, rebuild with `npm run build:app`.
- Tasks 6–7 are one compile unit (types change); `tsc` is only green after both. Tasks can run while the Task 5 audio regen runs in the background (regen only writes `public/audio/**`).

---

## Task 1: Shared voice + audio-path modules (TDD)

**Files:**
- Create: `src/shared/voices.ts`
- Create: `src/shared/audio-paths.ts`
- Test: `src/shared/voices.test.ts`

**Step 1: Write the failing test**

Create `src/shared/voices.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { VOICES, DEFAULT_VOICE_KEY, isVoiceKey } from "./voices.ts";
import { audioBase, mp3Url, cueUrl } from "./audio-paths.ts";

test("VOICES has the three expected keys with the default first", () => {
  assert.deepEqual(VOICES.map((v) => v.key), ["sonia", "ryan", "libby"]);
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
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — modules not found. (Note: `npm test` currently only runs `word-cues.test.ts`; this task also widens the test glob in Step 5.)

**Step 3: Write the implementations**

Create `src/shared/voices.ts`:

```ts
/** Single source of truth for the pre-generated voices (build + app). */
export interface VoiceDef {
  /** URL-safe folder key, e.g. "sonia". */
  key: string;
  /** edge-tts / Azure voice id, e.g. "en-GB-SoniaNeural". */
  id: string;
  /** Human label for the picker. */
  label: string;
}

export const VOICES: VoiceDef[] = [
  { key: "sonia", id: "en-GB-SoniaNeural", label: "Sonia (UK, female)" },
  { key: "ryan", id: "en-GB-RyanNeural", label: "Ryan (UK, male)" },
  { key: "libby", id: "en-GB-LibbyNeural", label: "Libby (UK, female)" },
];

export const DEFAULT_VOICE_KEY = "sonia";

export function isVoiceKey(key: string): boolean {
  return VOICES.some((v) => v.key === key);
}
```

Create `src/shared/audio-paths.ts`:

```ts
/** Relative audio path helpers, shared by the build and the browser app. */

export function audioBase(
  voiceKey: string,
  g: number,
  l: number,
  s: number,
  sent: number,
): string {
  return `audio/${voiceKey}/${g}_${l}_${s}_${sent}`;
}

export function mp3Url(voiceKey: string, g: number, l: number, s: number, sent: number): string {
  return `${audioBase(voiceKey, g, l, s, sent)}.mp3`;
}

export function cueUrl(voiceKey: string, g: number, l: number, s: number, sent: number): string {
  return `${audioBase(voiceKey, g, l, s, sent)}.mp3.json`;
}
```

**Step 4: Widen the test script**

In `package.json`, change the `test` script to discover all `src` test files:

```json
"test": "node --import tsx --test 'src/**/*.test.ts'"
```

**Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (existing `word-cues` tests + new `voices` tests).

**Step 6: Lint**

Run: `npm run lint`
Expected: clean.

---

## Task 2: Settings — migrate voiceName → voiceKey (TDD)

**Files:**
- Modify: `src/app/settings.ts`
- Test: `src/app/settings.test.ts`

**Step 1: Write the failing test**

Create `src/app/settings.test.ts`:

```ts
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
```

**Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — `normalizeVoiceKey` not exported.

**Step 3: Implement**

In `src/app/settings.ts`:

1. Add import at top:
   ```ts
   import { DEFAULT_VOICE_KEY, isVoiceKey } from "../shared/voices";
   ```
2. Change the `Settings` interface field `voiceName?: string;` to:
   ```ts
   voiceKey: string;
   ```
3. Add the helper (used by loadSettings and the test):
   ```ts
   export function normalizeVoiceKey(value: unknown): string {
     return typeof value === "string" && isVoiceKey(value) ? value : DEFAULT_VOICE_KEY;
   }
   ```
4. In `loadSettings`, update the fallback object and parsing:
   ```ts
   const fallback: Settings = {
     rate: 1,
     pauseMs: PAUSE_DEFAULT,
     activeTab: "part1",
     voiceKey: DEFAULT_VOICE_KEY,
   };
   ```
   Replace the `voiceName` line with:
   ```ts
   const voiceKey = normalizeVoiceKey(
     (parsed as { voiceKey?: unknown }).voiceKey,
   );
   return { rate, pauseMs, activeTab, voiceKey };
   ```

**Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS.

**Step 5: Typecheck note**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: errors only in `reader-app.ts`/`speech-engine.ts` referencing `voiceName` — fixed in Tasks 6–7.

---

## Task 3: Build pipeline — multi-voice generation + manifest shape

**Files:**
- Modify: `src/build/generate-audio.ts`

**Step 1: Import the shared voices**

Add near the top imports:

```ts
import { VOICES, DEFAULT_VOICE_KEY } from "../shared/voices.js";
```

**Step 2: Replace the single-voice config + path with voice-keyed versions**

- Remove the `VOICE_CONFIG` constant.
- Change `audioPath` to take a `voiceKey`:
  ```ts
  function audioPath(
    voiceKey: string,
    gIdx: number,
    lIdx: number,
    sIdx: number,
    sentIdx: number,
  ): string {
    return join(AUDIO_DIR, voiceKey, `${gIdx}_${lIdx}_${sIdx}_${sentIdx}.mp3`);
  }
  ```

**Step 3: Update the manifest types**

```ts
interface AudioManifest {
  voices: { key: string; id: string; label: string }[];
  defaultVoice: string;
  /** Key: "{g}_{l}_{s}" → entry. Shared across voices (counts are text-driven). */
  segments: Record<string, AudioManifestEntry>;
}
```

**Step 4: Make `generateAudio` loop voices**

Change its signature to accept a single voice and per-voice tts, and call it once per voice. Replace the body so it constructs the TTS for the given voice and writes under that voice's folder:

```ts
async function generateAudio(
  voice: { key: string; id: string },
  groups: Group[],
  force: boolean,
  manifest: AudioManifest,
): Promise<{ generated: number; skipped: number }> {
  const tts = new EdgeTTS({
    voice: voice.id,
    lang: "en-GB",
    outputFormat: "audio-24khz-48kbitrate-mono-mp3",
    saveSubtitles: true,
  });

  mkdirSync(join(AUDIO_DIR, voice.key), { recursive: true });

  let generated = 0;
  let skipped = 0;

  for (let gIdx = 0; gIdx < groups.length; gIdx++) {
    const group = groups[gIdx];
    for (let lIdx = 0; lIdx < group.lessons.length; lIdx++) {
      const lesson = group.lessons[lIdx];
      for (let sIdx = 0; sIdx < lesson.segments.length; sIdx++) {
        const segment = lesson.segments[sIdx];
        const sentences = flattenSentences(segment.text);
        // Manifest counts are voice-independent; write once (idempotent).
        manifest.segments[segmentKey(gIdx, lIdx, sIdx)] = { sentenceCount: sentences.length };

        for (let sentIdx = 0; sentIdx < sentences.length; sentIdx++) {
          const outPath = audioPath(voice.key, gIdx, lIdx, sIdx, sentIdx);
          const cuePath = `${outPath}.json`;
          if (!force && existsSync(outPath) && existsSync(cuePath)) {
            skipped++;
            continue;
          }
          const text = sentences[sentIdx].text;
          try {
            await tts.ttsPromise(text, outPath);
            generated++;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`  [ERROR] ${voice.key} ${segmentKey(gIdx, lIdx, sIdx)}_${sentIdx}: ${msg}`);
            await sleep(1000);
            try {
              await tts.ttsPromise(text, outPath);
              generated++;
            } catch {
              console.error(`  [SKIP] ${voice.key} ${segmentKey(gIdx, lIdx, sIdx)}_${sentIdx}: retry failed`);
            }
          }
          if (generated % 10 === 0) await sleep(200);
        }
      }
      console.log(`  [${voice.key}] ${group.label} / ${lesson.title} done`);
    }
  }
  return { generated, skipped };
}
```

**Step 5: Add a pre-flight voice-id validation**

Add this helper and call it before the main loop, so an invalid voice id aborts immediately instead of after a long run:

```ts
async function validateVoice(voice: { key: string; id: string }): Promise<void> {
  const tts = new EdgeTTS({ voice: voice.id, lang: "en-GB", saveSubtitles: false });
  const tmp = join(AUDIO_DIR, `.validate-${voice.key}.mp3`);
  await tts.ttsPromise("Test.", tmp);
  // cleanup
  try { (await import("node:fs")).rmSync(tmp, { force: true }); } catch { /* noop */ }
}
```

**Step 6: Rewrite `main()` to loop voices and write the new manifest**

Replace the body of `main()` so it:
1. Loads lessons.
2. Pre-flights every voice (`for (const v of VOICES) await validateVoice(v);`) and aborts on throw.
3. Initializes `const manifest: AudioManifest = { voices: VOICES, defaultVoice: DEFAULT_VOICE_KEY, segments: {} };`
4. Loops `for (const v of VOICES) { const { generated, skipped } = await generateAudio(v, groups, force, manifest); console.log(...) }`
5. Writes `MANIFEST_FILE`.

(Keep the existing `loadLessons`, `segmentKey`, `sleep`, arg parsing.)

**Step 7: Lint + typecheck the build script**

Run: `npm run lint && npx tsc --noEmit -p tsconfig.json`
Expected: build script clean (app errors remain until Tasks 6–7).

---

## Task 4: Move existing Sonia audio into the voice-keyed folder

**Files:**
- Filesystem only: `public/audio/uk/` → `public/audio/sonia/`

**Step 1: Move**

Run:
```bash
mv public/audio/uk public/audio/sonia
```

**Step 2: Verify**

Run:
```bash
echo "sonia mp3: $(ls public/audio/sonia/*.mp3 | wc -l) | sonia json: $(ls public/audio/sonia/*.mp3.json | wc -l)"
ls public/audio/uk 2>/dev/null && echo "uk STILL EXISTS (bad)" || echo "uk gone (good)"
```
Expected: 821 mp3 + 821 json under `sonia/`; `uk` gone.

---

## Task 5: Generate Ryan + Libby audio (HEAVY — network)

**Files:**
- Writes: `public/audio/ryan/**`, `public/audio/libby/**`, rewrites `public/audio-manifest.json`

**Step 1: Run the generator**

Run: `npm run build:audio`
Expected: pre-flight validates 3 voices; `sonia` all-skipped (files exist); `ryan` and `libby` generate ~821 each (network, several minutes each); ends with the manifest written. Transient 503/timeout lines auto-retry; a cheap re-run fills any leftovers (skip-if-both).

**Step 2: Verify parity + manifest shape**

Run:
```bash
for v in sonia ryan libby; do echo "$v: mp3 $(ls public/audio/$v/*.mp3 | wc -l) / json $(ls public/audio/$v/*.mp3.json | wc -l)"; done
node -e "const m=require('./public/audio-manifest.json'); console.log('voices:', m.voices.map(v=>v.key).join(','), '| default:', m.defaultVoice, '| segments:', Object.keys(m.segments).length)"
```
Expected: each voice 821/821; manifest `voices: sonia,ryan,libby`, `default: sonia`, `segments: 166`.

**Step 3: Integrity sweep (no empty cue arrays / truncated mp3s)**

Run the same sweep used for the word-highlight feature, adapted to all three folders (0 malformed, 0 empty cue arrays, 0 mp3 < 500B). If any are bad, re-run `npm run build:audio` (fills only the missing).

---

## Task 6: Speech engine — voiceKey-aware URLs + switch (compile unit with Task 7)

**Files:**
- Modify: `src/app/speech-engine.ts`

**Step 1: Imports + manifest type**

- Add: `import { mp3Url } from "../shared/audio-paths";` and `import { DEFAULT_VOICE_KEY } from "../shared/voices";`
- Replace the `AudioManifest` interface to match the build:
  ```ts
  export interface AudioManifest {
    voices: { key: string; id: string; label: string }[];
    defaultVoice: string;
    segments: Record<string, AudioManifestEntry>;
  }
  ```

**Step 2: Voice-key state + setter**

Add field near other private fields:
```ts
private voiceKey = DEFAULT_VOICE_KEY;
```
Add method (restarts the current sentence so the new voice is heard immediately):
```ts
setVoiceKey(key: string): void {
  if (key === this.voiceKey) return;
  this.voiceKey = key;
  if (this.cursor && this.currentAudio) this.restartCurrent();
}
```
(`restartCurrent` already exists: it `stopSpeaking()` then `speakCurrent()`.)

**Step 3: Use the voice-keyed URL**

Replace `audioFileUrl`:
```ts
private audioFileUrl(segmentIndex: number, sentenceIndex: number): string {
  const loc = this.lessonLocation!;
  return mp3Url(this.voiceKey, loc.groupIndex, loc.lessonIndex, segmentIndex, sentenceIndex);
}
```

(`hasAudioFor` reads `this.audioManifest.segments[...]` — unchanged, counts are shared. `setVoice`/`this.voice` stay for the Web Speech fallback.)

**Step 4: Typecheck (still expect reader-app errors)**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: remaining errors only in `reader-app.ts`.

---

## Task 7: App — picker lists pre-generated voices

**Files:**
- Modify: `src/app/reader-app.ts`

**Step 1: Imports**

Add: `import { VOICES } from "../shared/voices";` and `import { cueUrl } from "../shared/audio-paths";`

**Step 2: Replace `refreshVoiceList` with two responsibilities**

`refreshVoiceList` currently (a) fills the picker from Web Speech voices and (b) sets the engine voice. Split it:

Replace `refreshVoiceList` with `renderVoicePicker` (pre-generated voices):
```ts
private renderVoicePicker(): void {
  const select = this.voicePicker;
  select.innerHTML = "";
  select.disabled = false;
  VOICES.forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v.key;
    opt.textContent = v.label;
    select.append(opt);
  });
  select.value = this.settings.voiceKey;
  this.speech.setVoiceKey(this.settings.voiceKey);
}
```

Add `refreshFallbackVoice` (keeps VoiceRegistry only for the silent Web Speech fallback):
```ts
private refreshFallbackVoice(): void {
  this.speech.setVoice(this.voices.pick());
}
```

**Step 3: Update `init` wiring**

In `init()`, replace `this.refreshVoiceList();` and `this.voices.onChange(() => this.refreshVoiceList());` with:
```ts
this.renderVoicePicker();
this.refreshFallbackVoice();
this.voices.onChange(() => this.refreshFallbackVoice());
```

**Step 4: Update the picker change handler**

Replace the `voicePicker` `change` listener in `attachControlHandlers`:
```ts
this.voicePicker.addEventListener("change", () => {
  const key = this.voicePicker.value;
  this.settings.voiceKey = key;
  saveSettings(this.settings);
  this.speech.setVoiceKey(key);
  // Refetch cues for this lesson in the new voice, then re-render.
  if (this.currentLesson) {
    const prepared = this.prepared.get(lessonKey(this.currentLesson));
    if (prepared) {
      prepared.forEach((p) => p.cues.fill(null));
      void this.loadCuesForLesson(this.currentLesson, prepared);
    }
  }
  this.announcer.announce(`Voice: ${this.voicePicker.selectedOptions[0]?.textContent ?? key}.`);
});
```

**Step 5: Make cue fetch voice-keyed**

In `loadCuesForLesson`, replace the URL line with the shared helper using the active voice:
```ts
const url = cueUrl(this.settings.voiceKey, location.groupIndex, location.lessonIndex, segIdx, sentIdx);
```
Also remove the early `anyLoaded` short-circuit's reliance on stale cues for voice switches: keep the function, but since Step 4 clears `cues` before re-calling, the guard correctly proceeds. (No other change.)

**Step 6: Typecheck + build**

Run: `npx tsc --noEmit -p tsconfig.json` → clean.
Run: `npm run build:app` → writes `public/app.js`.
Run: `npm run lint` → clean.

---

## Task 8: Docs + index.html label

**Files:**
- Modify: `CONTRACT.md`
- Modify: `public/index.html` (optional label)

**Step 1: Update CONTRACT.md**

- Change the audio path convention from `public/audio/uk/{...}.mp3` to `public/audio/{voiceKey}/{...}.mp3` (+ `.mp3.json` cue).
- Update the manifest description to the new shape (`voices[]`, `defaultVoice`, shared `segments`).

**Step 2: (Optional) index.html**

The `#voice-picker` `<select>` and its "Voice" label already fit; no structural change required. Leave as-is unless the label needs wording.

---

## Task 9: Verify end-to-end

**Step 1: Unit + build**

Run: `npm test && npm run build && npm run lint`
Expected: all tests pass; build ok; lint clean.

**Step 2: Manifest + audio parity**

Run the Task 5 Step 2/3 checks again. Expected: 3 voices × 821, manifest correct, no corrupt files.

**Step 3: Runtime — voices actually differ + highlight stays synced (Playwright)**

Serve `public/` and, for a Part 2 lesson:
1. Confirm the picker lists exactly `Sonia (UK, female)`, `Ryan (UK, male)`, `Libby (UK, female)`.
2. Select Ryan, play, confirm a `.word.is-active` appears and advances, and the playing `<audio>` `src` contains `audio/ryan/`.
3. Select Libby, confirm `src` contains `audio/libby/`.
4. Confirm the chosen voice persists across reload (localStorage `voiceKey`).

Reuse the word-highlight verification harness (`/tmp/pw-venv`, `with_server.py`) extended to read `document.querySelector('audio')?.currentSrc` and the `#voice-picker` options.

---

## Done criteria

- `npm test` passes (word-cues + voices + settings); `npm run lint` clean; `npm run build` ok.
- `public/audio/{sonia,ryan,libby}/` each have 821 mp3 + 821 json; manifest lists 3 voices, default sonia, 166 segments.
- Picker lists the 3 voices; selecting one changes the audible voice (verified via `<audio>` src) and keeps word highlight synced; choice persists.
- Web Speech only used when an MP3 is missing. No new runtime dependencies.
```
