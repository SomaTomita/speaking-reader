# Word-by-Word Karaoke Highlight Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Highlight each word as it is pronounced during audio playback in the IELTS reader, karaoke-fill style, synced to real edge-tts word timestamps.

**Architecture:** A one-time audio-build change emits a `{file}.mp3.json` word-cue sidecar per sentence. At lesson open the app lazily fetches those cues and renders one `<span>` per word; a `requestAnimationFrame` loop reads `audio.currentTime` and advances a cue pointer, flipping each word between upcoming / active / read. Falls back to the existing sentence-level highlight when cues are absent.

**Tech Stack:** TypeScript 5.6 (ES modules), esbuild bundle, tsx for Node build scripts, `node-edge-tts` (build-time), Node 22 built-in test runner (`node:test`) via tsx. No new runtime dependencies.

**Design doc:** `docs/plans/2026-06-09-word-highlight-design.md`

---

## Conventions for the implementer

- All paths are relative to `reader/` (the npm project root). Run all commands from there.
- This directory is **not** a git repo. Where steps say "Commit", instead stop and let the reviewer inspect the diff (or `git init` first if you want version control). Do not skip the verify steps.
- Generated files you must NOT hand-edit: `public/data.js`, `public/app.js`, `public/audio-manifest.json`, `public/audio/uk/*`. Regenerate via the build scripts.
- After any change to `src/app/*.ts`, rebuild the bundle with `npm run build:app` before testing in the browser.

---

## Task 0: Add a test runner (no new dependency)

**Files:**
- Modify: `package.json` (scripts)

**Step 1: Add the `test` script**

In `package.json` `"scripts"`, add:

```json
"test": "node --import tsx --test src/shared/word-cues.test.ts"
```

**Step 2: Verify the runner works (expect "no test files" or a pass-through error is fine for now)**

Run: `npm test`
Expected: it executes (it will error that the test file does not exist yet — that is fine; the next task creates it).

---

## Task 1: Shared word-cue helpers (TDD)

**Files:**
- Create: `src/shared/word-cues.ts`
- Test: `src/shared/word-cues.test.ts`

**Step 1: Write the failing test**

Create `src/shared/word-cues.test.ts`:

```ts
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
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find module `./word-cues.ts` (or export errors).

**Step 3: Write the minimal implementation**

Create `src/shared/word-cues.ts`:

```ts
/**
 * Word-cue types and pure helpers shared between the build pipeline and app.
 *
 * Cues come from node-edge-tts `saveSubtitles`, written as `{file}.mp3.json`:
 *   [{ part: "word ", start: <ms>, end: <ms> }, ...]
 * `start`/`end` are media-time milliseconds (1x), so they remain valid at any
 * playbackRate because HTMLMediaElement.currentTime is also media-time.
 */

export interface WordCue {
  /** Word text as segmented by the TTS engine; may include trailing space. */
  part: string;
  /** Media-time start in milliseconds. */
  start: number;
  /** Media-time end in milliseconds. */
  end: number;
}

export interface WordUnit {
  /** Visible word with surrounding whitespace stripped. */
  word: string;
  /** Trailing whitespace to render outside the highlightable span. */
  trailing: string;
  start: number;
  end: number;
}

const TRAILING_WS_RE = /^([\s\S]*?)(\s*)$/;

/** Split each cue into a word + trailing whitespace so the highlight stays tight. */
export function buildWordUnits(cues: WordCue[]): WordUnit[] {
  return cues.map((c) => {
    const m = TRAILING_WS_RE.exec(c.part);
    const word = m ? m[1] : c.part;
    const trailing = m ? m[2] : "";
    return { word, trailing, start: c.start, end: c.end };
  });
}

/**
 * Index of the word currently being pronounced at media time `tMs`:
 * the last cue whose `start` is <= tMs. Returns -1 before the first word.
 */
export function activeCueIndex(cues: WordCue[], tMs: number): number {
  let idx = -1;
  for (let i = 0; i < cues.length; i++) {
    if (cues[i].start <= tMs) idx = i;
    else break;
  }
  return idx;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (6/6).

**Step 5: Lint**

Run: `npm run lint`
Expected: clean.

---

## Task 2: Emit word-cue sidecars from the audio build

**Files:**
- Modify: `src/build/generate-audio.ts`

**Step 1: Enable subtitles on the TTS client**

In `generateAudio`, change the `EdgeTTS` construction to request word boundaries:

```ts
const tts = new EdgeTTS({
  voice: VOICE_CONFIG.voice,
  lang: VOICE_CONFIG.lang,
  outputFormat: "audio-24khz-48kbitrate-mono-mp3",
  saveSubtitles: true,
});
```

**Step 2: Treat a sentence as "done" only when both MP3 and cue JSON exist**

Replace the skip check inside the sentence loop:

```ts
const outPath = audioPath(gIdx, lIdx, sIdx, sentIdx);
const cuePath = `${outPath}.json`;

if (!force && existsSync(outPath) && existsSync(cuePath)) {
  skipped++;
  continue;
}
```

(`node-edge-tts` writes `${outPath}.json` automatically when `saveSubtitles` is on. No other code change is needed in this file.)

**Step 3: Backfill cues for all existing audio (one-time, network)**

Run: `npm run build:audio`
Expected: it regenerates the 821 sentences (they lack `.json` sidecars), printing `... done` per lesson and a final `N generated, M skipped`. This makes network calls and takes several minutes.

**Step 4: Verify a sidecar exists and parses**

Run:
```bash
ls public/audio/uk/0_0_0_0.mp3.json && node -e "const c=require('./public/audio/uk/0_0_0_0.mp3.json'); console.log('cues:', c.length, '| first:', JSON.stringify(c[0]))"
```
Expected: prints a positive cue count and a first cue object with `part`, `start`, `end`.

**Step 5: Verify count parity (every MP3 has a JSON)**

Run:
```bash
cd public/audio/uk && echo "mp3: $(ls *.mp3 | wc -l) | json: $(ls *.mp3.json | wc -l)"; cd -
```
Expected: `mp3` and `json` counts are equal (821 each).

---

## Task 3: Carry cues on PreparedSegment and add the onWord callback

**Files:**
- Modify: `src/app/settings.ts` (PreparedSegment)
- Modify: `src/app/speech-engine.ts` (callback type)

**Step 1: Add a cues field to PreparedSegment**

In `src/app/settings.ts`, extend the interface (cues are aligned to the flat `sentences` array; `null` means no cue file for that sentence):

```ts
export interface PreparedSegment {
  segment: import("../shared/types").Segment;
  paragraphs: string[][];
  sentences: import("../shared/sentence-splitter").SentenceRef[];
  cues: (import("../shared/word-cues").WordCue[] | null)[];
}
```

**Step 2: Add onWord to the engine callbacks**

In `src/app/speech-engine.ts`, extend `SpeechEngineCallbacks`:

```ts
export interface SpeechEngineCallbacks {
  onSentenceStart: (ref: SentenceRef) => void;
  onWord: (wordIndex: number) => void;
  onSegmentStart: (segmentIndex: number) => void;
  onSegmentEnd: (segmentIndex: number) => void;
  onStop: () => void;
  onError: (message: string) => void;
}
```

**Step 3: Compile-check (do not build yet)**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: errors only about missing `onWord` in `reader-app.ts` and missing `cues` in `prepareSegment` — those are fixed in later tasks. No errors inside `settings.ts` / `speech-engine.ts` themselves.

---

## Task 4: Drive the rAF word-sync loop in the speech engine

**Files:**
- Modify: `src/app/speech-engine.ts`

**Step 1: Import the cue helper**

Add to the top imports:

```ts
import { activeCueIndex, type WordCue } from "../shared/word-cues";
```

**Step 2: Add a rAF field and start/stop helpers**

Add a field near the other private fields:

```ts
private wordRafId: number | null = null;
```

Add these methods to the class:

```ts
private startWordSync(cues: WordCue[]): void {
  this.stopWordSync();
  let last = -1;
  const tick = (): void => {
    if (!this.currentAudio) {
      this.wordRafId = null;
      return;
    }
    const tMs = this.currentAudio.currentTime * 1000;
    const idx = activeCueIndex(cues, tMs);
    if (idx !== last) {
      last = idx;
      if (idx >= 0) this.cb.onWord(idx);
    }
    this.wordRafId = requestAnimationFrame(tick);
  };
  this.wordRafId = requestAnimationFrame(tick);
}

private stopWordSync(): void {
  if (this.wordRafId !== null) {
    cancelAnimationFrame(this.wordRafId);
    this.wordRafId = null;
  }
}
```

**Step 3: Stop the loop whenever audio stops**

At the top of `stopSpeaking()`, before clearing timers, add:

```ts
this.stopWordSync();
```

**Step 4: Start the loop when a cued sentence begins playing**

In `speakWithAudio`, the `oncanplaythrough` handler currently calls `onSentenceStart`. Update it to also start word sync when cues exist for this sentence:

```ts
audio.oncanplaythrough = (): void => {
  this.cb.onSentenceStart(sentence);
  const cues = segment.cues?.[capturedCursor.sentenceIndex] ?? null;
  if (cues && cues.length > 0) this.startWordSync(cues);
};
```

And in the same method's `onended` handler, stop the loop before advancing:

```ts
audio.onended = (): void => {
  if (!this.cursor) return;
  if (
    this.cursor.segmentIndex !== capturedCursor.segmentIndex ||
    this.cursor.sentenceIndex !== capturedCursor.sentenceIndex
  )
    return;
  this.stopWordSync();
  this.currentAudio = null;
  this.audioPaused = false;
  this.advanceToNextSentence(segment, sentence);
};
```

(`capturedCursor` already exists in `speakWithAudio`. The synthesis fallback path does not start word sync, so it keeps today's sentence-level behaviour.)

**Step 5: Compile-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: remaining errors only in `reader-app.ts` (missing `onWord` handler, `cues` in `prepareSegment`, word-span bookkeeping). Fixed next.

---

## Task 5: Load cues and render word spans in the app

**Files:**
- Modify: `src/app/reader-app.ts`

**Step 1: Import cue helpers**

Add to imports:

```ts
import { buildWordUnits, type WordCue } from "../shared/word-cues";
```

**Step 2: Give every prepared segment an empty cues array**

Update `prepareSegment` so the shape matches the new interface (cues filled in later, async):

```ts
function prepareSegment(segment: Segment): PreparedSegment {
  const paragraphs = splitIntoParagraphs(segment.text).map(splitSentences);
  const sentences = flattenParagraphs(paragraphs);
  return { segment, paragraphs, sentences, cues: sentences.map(() => null) };
}
```

**Step 3: Add word-span bookkeeping fields**

Next to `private sentenceEls: HTMLElement[][] = [];` add:

```ts
// wordEls[segmentIndex][flatSentenceIndex][wordIndex]
private wordEls: HTMLElement[][][] = [];
private activeWordSentence: HTMLElement[] | null = null;
```

**Step 4: Register the onWord handler**

In the `new SpeechEngine({ ... })` callback object, add:

```ts
onWord: (wordIndex) => this.highlightWord(wordIndex),
```

**Step 5: Fetch cues when a lesson opens**

In `openLesson`, after `const prepared = this.getPreparedSegments(location, lesson);` and before `this.speech.setSegments(prepared);`, kick off cue loading (it mutates the cached prepared segments, then re-renders so spans appear once cues arrive):

```ts
void this.loadCuesForLesson(location, prepared);
```

Add the method:

```ts
private async loadCuesForLesson(
  location: LessonLocation,
  prepared: PreparedSegment[],
): Promise<void> {
  // Already loaded for this cached lesson? Skip.
  const anyLoaded = prepared.some((p) => p.cues.some((c) => c !== null));
  if (anyLoaded) return;

  const jobs: Promise<void>[] = [];
  prepared.forEach((prep, segIdx) => {
    prep.sentences.forEach((_sentence, sentIdx) => {
      const url = `audio/uk/${location.groupIndex}_${location.lessonIndex}_${segIdx}_${sentIdx}.mp3.json`;
      jobs.push(
        fetch(url)
          .then((res) => (res.ok ? (res.json() as Promise<WordCue[]>) : null))
          .then((cues) => {
            if (Array.isArray(cues)) prep.cues[sentIdx] = cues;
          })
          .catch(() => {
            /* leave null → sentence-level fallback */
          }),
      );
    });
  });

  await Promise.all(jobs);
  // Re-render only if this lesson is still open.
  if (this.currentLesson && lessonKey(this.currentLesson) === lessonKey(location)) {
    this.renderSegments(prepared);
  }
}
```

**Step 6: Render word spans when cues are present**

Replace the inner sentence-rendering loop in `renderSegments`. Reset `this.wordEls = [];` alongside the other resets, then build per-word spans:

```ts
private renderSegments(segments: PreparedSegment[]): void {
  this.segmentsEl.innerHTML = "";
  this.sentenceEls = [];
  this.segmentEls = [];
  this.segmentPlayButtons = [];
  this.wordEls = [];

  segments.forEach((prep, segIdx) => {
    const card = document.createElement("section");
    card.className = "segment";
    card.dataset.index = String(segIdx);
    card.dataset.playing = "false";

    const head = document.createElement("header");
    head.className = "segment__head";
    const label = document.createElement("h3");
    label.className = "segment__label";
    label.textContent = prep.segment.label;
    head.append(label);

    const playBtn = document.createElement("button");
    playBtn.type = "button";
    playBtn.className = "icon-button icon-button--primary segment__play";
    playBtn.setAttribute("aria-label", `Play ${prep.segment.label}`);
    playBtn.innerHTML = `<span aria-hidden="true">▶</span>`;
    playBtn.addEventListener("click", () => this.toggleSegmentPlayback(segIdx));
    head.append(playBtn);
    card.append(head);

    const body = document.createElement("div");
    body.className = "segment__text";
    const sentenceElsForSegment: HTMLElement[] = [];
    const wordElsForSegment: HTMLElement[][] = [];
    let sentenceRunningIndex = 0;

    prep.paragraphs.forEach((paraSentences, paraIdx) => {
      const para = document.createElement("p");
      para.className = "segment__paragraph";
      // paragraphs are split lists; flat sentence index advances across paragraphs
      paraSentences.forEach((text) => {
        const flatIdx = sentenceRunningIndex;
        const span = document.createElement("span");
        span.className = "segment__sentence";
        span.dataset.idx = String(flatIdx);

        const cues = prep.cues[flatIdx];
        const wordsForSentence: HTMLElement[] = [];
        if (cues && cues.length > 0) {
          span.classList.add("segment__sentence--words");
          buildWordUnits(cues).forEach((unit) => {
            const w = document.createElement("span");
            w.className = "word";
            w.textContent = unit.word;
            span.append(w);
            wordsForSentence.push(w);
            if (unit.trailing) span.append(document.createTextNode(unit.trailing));
          });
        } else {
          span.textContent = text;
        }

        para.append(span);
        para.append(document.createTextNode(" "));
        sentenceElsForSegment.push(span);
        wordElsForSegment.push(wordsForSentence);
        sentenceRunningIndex += 1;
      });
      body.append(para);
      void paraIdx;
    });

    card.append(body);
    this.segmentsEl.append(card);
    this.segmentEls.push(card);
    this.segmentPlayButtons.push(playBtn);
    this.sentenceEls.push(sentenceElsForSegment);
    this.wordEls.push(wordElsForSegment);
  });
}
```

**Step 7: Implement the word highlighter and finalize-on-sentence-change**

Add `highlightWord`, and clear word state when a sentence finishes. Update `highlightSentence` to finalize the previous sentence's words (mark all read) and track the new sentence's word list:

```ts
private highlightWord(wordIndex: number): void {
  const cursor = this.speech.currentCursor;
  if (!cursor) return;
  const words = this.wordEls[cursor.segmentIndex]?.[cursor.sentenceIndex];
  if (!words) return;
  for (let i = 0; i < words.length; i++) {
    words[i].classList.toggle("is-read", i < wordIndex);
    words[i].classList.toggle("is-active", i === wordIndex);
  }
}
```

In `highlightSentence`, after computing the new sentence span, finalize the previously active sentence's words:

```ts
private highlightSentence(): void {
  const cursor = this.speech.currentCursor;
  if (!cursor) return;
  const segmentSpans = this.sentenceEls[cursor.segmentIndex];
  if (!segmentSpans) return;
  const span = segmentSpans[cursor.sentenceIndex];
  if (!span) return;

  // Finalize the previous sentence's words (all read, none active).
  if (this.activeWordSentence) {
    for (const w of this.activeWordSentence) {
      w.classList.remove("is-active");
      w.classList.add("is-read");
    }
  }
  this.activeWordSentence = this.wordEls[cursor.segmentIndex]?.[cursor.sentenceIndex] ?? null;

  if (this.activeSentenceEl && this.activeSentenceEl !== span) {
    this.activeSentenceEl.classList.remove("speaking");
  }
  span.classList.add("speaking");
  this.activeSentenceEl = span;
  span.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
}
```

In `handleStopUi`, also clear word state:

```ts
private handleStopUi(): void {
  if (this.activeSentenceEl) {
    this.activeSentenceEl.classList.remove("speaking");
    this.activeSentenceEl = null;
  }
  if (this.activeWordSentence) {
    for (const w of this.activeWordSentence) w.classList.remove("is-active", "is-read");
    this.activeWordSentence = null;
  }
  this.segmentEls.forEach((card, idx) => {
    if (card.dataset.playing === "true") this.markSegmentPlaying(idx, false);
  });
  this.player.hidden = true;
  this.playerPlayPauseIcon.textContent = "⏸";
  this.playerPlayPause.setAttribute("aria-label", "Pause");
}
```

**Step 8: Compile-check + build**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: clean.

Run: `npm run build:app`
Expected: writes `public/app.js`, no errors.

---

## Task 6: Karaoke-fill styling

**Files:**
- Modify: `public/styles.css`

**Step 1: Add word states near the `.segment__sentence` rules**

```css
/* Word-level karaoke fill (only when cues are present) */
.segment__sentence--words .word {
  color: var(--text-muted);
  border-radius: 3px;
  padding: 0 1px;
  transition: color var(--transition-motion),
    background-color var(--transition-motion);
}

.segment__sentence--words .word.is-read {
  color: var(--text);
}

.segment__sentence--words .word.is-active {
  color: var(--accent-contrast);
  /* accent-active (#5f6f5e) passes WCAG AA (5.35:1) with white; the resting
     accent (#7b8b7a) is only 3.61:1, so use accent-active for text legibility. */
  background-color: var(--accent-active);
}
```

**Step 2: Stop the sentence background from fighting the word fill**

When words are present, the per-word fill carries the highlight, so the sentence box should not also paint its background. Scope the existing `.speaking` background to non-word sentences by adding `:not(.segment__sentence--words)`:

```css
.segment__sentence.speaking:not(.segment__sentence--words) {
  background-color: var(--highlight);
  box-shadow: -4px 0 0 var(--highlight-border);
  padding-left: 8px;
  margin-left: -4px;
}
```

(Leave the original `.segment__sentence.speaking` rule's other concerns intact; only the background treatment is scoped. Reduced-motion already snaps these transitions via the global rule.)

**Step 3: Rebuild is not needed for CSS** (served statically). Proceed to verification.

---

## Task 7: Verify end to end

**Step 1: Re-run unit tests and lint**

Run: `npm test && npm run lint`
Expected: tests PASS, lint clean.

**Step 2: Build everything**

Run: `npm run build`
Expected: `build:data` + `build:app` succeed.

**Step 3: Manual verification in the browser**

Run: `npm run dev` (serves `public/` on :8080).

Check, with the browser open:
1. Open a **Part 2** lesson (single long segment). Press Play.
   - Each word turns sage (active) exactly as it is spoken; already-spoken words return to normal text colour; upcoming words are muted grey.
2. Open a **Part 1** lesson (several Q segments). Play a single segment via its card button.
   - Word fill tracks audio; on sentence change the previous sentence is fully "read", the next sentence starts filling.
3. Move the **Speed** slider to 0.7x and 1.3x mid-playback.
   - The fill stays in sync (cues are media-time, so rate does not desync them).
4. Press **Stop**.
   - All word highlighting clears; no word stays sage.
5. Open the same lesson again.
   - Cues are cached (no refetch); highlight still works.

**Step 4: Verify the fallback path**

Temporarily rename one sentence's cue file, e.g. `public/audio/uk/2_0_0_0.mp3.json` → `.bak`, reload, open that lesson, and play.
Expected: that sentence falls back to the old sentence-level highlight (soft background), no console errors. Restore the file afterwards.

---

## Done criteria

- `npm test` passes; `npm run lint` clean; `npm run build` succeeds.
- Every MP3 has a matching `.mp3.json` cue file (821 each).
- Word fill is visually in sync at 1.0x and off-speed; clears on stop; cached on reopen; degrades to sentence highlight when a cue file is missing.
- No new runtime dependencies; bundle still builds to a single IIFE.
```
