/**
 * generate-audio.ts — Build-time script that generates per-sentence MP3 files
 * using Microsoft Edge TTS (via node-edge-tts). No API key required.
 *
 * Usage: tsx src/build/generate-audio.ts [--force]
 *
 * Reads public/data.js, splits each segment into sentences, generates an MP3
 * for every sentence across all configured voices, and writes public/audio-manifest.json.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EdgeTTS } from "node-edge-tts";
import { flattenSentences } from "../shared/sentence-splitter.js";
import type { Group } from "../shared/types.js";
import { VOICES, DEFAULT_VOICE_KEY } from "../shared/voices.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const READER_DIR = resolve(__dirname, "../..");
const PUBLIC_DIR = join(READER_DIR, "public");
const DATA_FILE = join(PUBLIC_DIR, "data.js");
const AUDIO_DIR = join(PUBLIC_DIR, "audio");
const MANIFEST_FILE = join(PUBLIC_DIR, "audio-manifest.json");

// ── Manifest types ───────────────────────────────────────────────────

interface AudioManifestEntry {
  /** Number of sentence audio files for this segment. */
  sentenceCount: number;
}

interface AudioManifest {
  voices: { key: string; id: string; label: string }[];
  defaultVoice: string;
  /** Key: "{g}_{l}_{s}" → entry. Shared across voices (counts are text-driven). */
  segments: Record<string, AudioManifestEntry>;
}

// ── CLI args ─────────────────────────────────────────────────────────

function parseArgs(): { force: boolean } {
  return { force: process.argv.includes("--force") };
}

// ── Data loading ─────────────────────────────────────────────────────

function loadLessons(): Group[] {
  const raw = readFileSync(DATA_FILE, "utf8");
  // data.js format: `window.LESSONS = [ ... ];`
  const jsonStr = raw.replace(/^[^[]*/, "").replace(/;\s*$/, "");
  return JSON.parse(jsonStr) as Group[];
}

// ── Audio file path convention ───────────────────────────────────────

function audioPath(
  voiceKey: string,
  gIdx: number,
  lIdx: number,
  sIdx: number,
  sentIdx: number,
): string {
  return join(AUDIO_DIR, voiceKey, `${gIdx}_${lIdx}_${sIdx}_${sentIdx}.mp3`);
}

function segmentKey(gIdx: number, lIdx: number, sIdx: number): string {
  return `${gIdx}_${lIdx}_${sIdx}`;
}

// ── Pre-flight validation ────────────────────────────────────────────

async function validateVoice(voice: { key: string; id: string }): Promise<void> {
  const tts = new EdgeTTS({ voice: voice.id, lang: "en-GB", saveSubtitles: false });
  const tmp = join(AUDIO_DIR, `.validate-${voice.key}.mp3`);
  await tts.ttsPromise("Test.", tmp);
  rmSync(tmp, { force: true });
}

// ── Main generation ──────────────────────────────────────────────────

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
            console.error(
              `  [ERROR] ${voice.key} ${segmentKey(gIdx, lIdx, sIdx)}_${sentIdx}: ${msg}`,
            );
            await sleep(1000);
            try {
              await tts.ttsPromise(text, outPath);
              generated++;
            } catch {
              console.error(
                `  [SKIP] ${voice.key} ${segmentKey(gIdx, lIdx, sIdx)}_${sentIdx}: retry failed`,
              );
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Entry point ──────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { force } = parseArgs();

  if (!existsSync(DATA_FILE)) {
    console.error(`[generate-audio] ${DATA_FILE} not found. Run build:data first.`);
    process.exit(1);
  }

  console.log("[generate-audio] loading lessons...");
  const groups = loadLessons();

  let totalSegments = 0;
  let totalSentences = 0;
  for (const g of groups) {
    for (const l of g.lessons) {
      totalSegments += l.segments.length;
      for (const s of l.segments) {
        totalSentences += flattenSentences(s.text).length;
      }
    }
  }
  console.log(
    `[generate-audio] ${totalSegments} segments, ${totalSentences} sentences${force ? " (force)" : ""}`,
  );

  console.log("[generate-audio] validating voices...");
  mkdirSync(AUDIO_DIR, { recursive: true });
  for (const v of VOICES) {
    console.log(`  [preflight] ${v.key} (${v.id})`);
    await validateVoice(v);
    console.log(`  [preflight] ${v.key} OK`);
  }

  const manifest: AudioManifest = {
    voices: VOICES,
    defaultVoice: DEFAULT_VOICE_KEY,
    segments: {},
  };

  for (const v of VOICES) {
    console.log(`[generate-audio] generating audio for ${v.key}...`);
    const { generated, skipped } = await generateAudio(v, groups, force, manifest);
    console.log(`[generate-audio] ${v.key}: ${generated} generated, ${skipped} skipped`);
  }

  writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2), "utf8");
  console.log(`[generate-audio] wrote ${MANIFEST_FILE}`);
  console.log("[generate-audio] done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
