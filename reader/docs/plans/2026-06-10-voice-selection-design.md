# Multi-voice selection — design

Date: 2026-06-10
Project: IELTS Speaking Reader (`reader/`)
Status: Approved (brainstorming). Implementation plan pending.

## Problem

Every en-GB option in the voice picker sounds identical. Cause (confirmed in
code): playback always takes the MP3 path (`speakCurrent` → `speakWithAudio`
when an MP3 exists, and after the cue regen every sentence has one), and the
picker's `setVoice` only feeds `utterance.voice` inside `speakWithSynthesis`,
which never runs. The dropdown is also populated from the device's Web Speech
en-GB voices, which never play. So the control is a no-op.

## Goal

Make voice selection meaningful and genuinely switchable, keeping the
high-quality pre-generated audio and the word-by-word highlight.

## Decisions (locked)

1. Ship **multiple real, pre-generated voices** (not device Web Speech voices).
2. Voices: **Sonia ♀ (`en-GB-SoniaNeural`, default, already generated), Ryan ♂
   (`en-GB-RyanNeural`), Libby ♀ (`en-GB-LibbyNeural`)**.
3. Layout: **voice-keyed folders + single manifest** (Approach A).

## Key insight

Text is identical across voices, so **sentence and word counts are
voice-independent**. Only the audio and cue *timings* differ. Therefore the
manifest's `segments` (sentenceCount) is shared; only audio files and cue JSON
are per-voice.

## Design

### 1. Audio layout
`public/audio/{voiceKey}/{g}_{l}_{s}_{sent}.mp3` and `.mp3.json`, with
`voiceKey ∈ {sonia, ryan, libby}`. Rename the existing `public/audio/uk/` to
`public/audio/sonia/` (1642 files) so Sonia is reused, not regenerated.

### 2. Build (`generate-audio.ts`)
A `VOICES` array of `{ key, id }`:
`[{key:'sonia',id:'en-GB-SoniaNeural'},{key:'ryan',id:'en-GB-RyanNeural'},{key:'libby',id:'en-GB-LibbyNeural'}]`.
Loop voices; per voice construct `EdgeTTS({ voice: id, saveSubtitles: true })`
and write to `audio/{key}/`. Keep skip-if-both (Sonia all-skip after move;
Ryan/Libby generate ≈ 2×821 calls). **Pre-flight: generate one short clip per
voice id and abort if it errors**, to avoid a long run on an invalid id.

### 3. Manifest (`audio-manifest.json`)
Replace `voice: string` with:
```jsonc
{
  "voices": [
    { "key": "sonia", "id": "en-GB-SoniaNeural", "label": "Sonia (UK, female)" },
    { "key": "ryan",  "id": "en-GB-RyanNeural",  "label": "Ryan (UK, male)" },
    { "key": "libby", "id": "en-GB-LibbyNeural", "label": "Libby (UK, female)" }
  ],
  "defaultVoice": "sonia",
  "segments": { "0_0_0": { "sentenceCount": 3 } }   // shared across voices
}
```

### 4. App (`reader-app.ts`, `speech-engine.ts`)
- The picker now lists `manifest.voices` (pre-generated set), not Web Speech
  voices. Selecting one sets the active `voiceKey`.
- `audioFileUrl` and the cue-fetch URL use `audio/{voiceKey}/...`.
- Web Speech is demoted to the silent fallback only (used when an MP3 is
  missing); it is decoupled from the picker and uses a sensible default voice.

### 5. Voice switch behaviour
Changing voice mid-playback restarts the current sentence with the new voice
(same as the rate-change restart). Word spans are not rebuilt (counts match);
cues are refetched for the new `voiceKey` and the rAF loop picks up the new
timings. Stopped → applies on next play.

### 6. Settings
Migrate `voiceName` (Web Speech name) → `voiceKey` (`sonia`/`ryan`/`libby`),
default `sonia`. Unknown stored values fall back to the default.

### 7. Word highlight
Unchanged mechanism; cues come from the selected voice's folder, so the
highlight stays synced for every voice.

### 8. Deploy impact
3 voices ≈ 4,926 files / ~100MB. Within Cloudflare Pages limits (20,000 files,
25 MiB/file). `npm run deploy` unchanged.

## Files touched
`src/build/generate-audio.ts`, `audio-manifest.json` shape, `src/app/speech-engine.ts`,
`src/app/reader-app.ts`, `src/app/settings.ts`, `CONTRACT.md`. No new deps.

## Testing
- Unit: manifest `voices` parse, `voiceKey` → URL, settings migration
  (old `voiceName` → default `sonia`).
- Manual/Playwright: switch all three voices, confirm audio actually differs and
  the word highlight stays in sync.

## Out of scope
- Non-UK accents (US/AU).
- Per-voice speed defaults.
- More than the three chosen voices.

## Note
Not a git repo; doc saved, not committed.
