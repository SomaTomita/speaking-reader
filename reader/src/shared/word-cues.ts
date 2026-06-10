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
