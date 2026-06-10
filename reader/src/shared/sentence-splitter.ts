/**
 * Sentence splitting utilities — shared between the browser app and
 * the build-time audio generator.
 */

const MAX_SENTENCE_CHARS = 400;

const ABBREVIATIONS = new Set<string>([
  "mr",
  "mrs",
  "ms",
  "dr",
  "prof",
  "sr",
  "jr",
  "st",
  "mt",
  "vs",
  "etc",
  "e.g",
  "i.e",
  "u.k",
  "u.s",
  "u.s.a",
  "p.m",
  "a.m",
  "no",
]);

// Hoisted out of the per-character splitting loop — these have no `g`/`y`
// flag, so sharing a single instance is safe (no lastIndex state).
const ABBREV_TAIL_RE = /([A-Za-z.]+)\.$/;
const SINGLE_LETTER_RE = /^[a-z]$/;
const DOTTED_INITIALS_RE = /^([a-z]\.)*[a-z]$/;
const CLOSING_PUNCT_RE = /["'"')\]]/;
const SENTENCE_START_RE = /[A-Z""'([]/;

function isLikelyAbbreviation(buffer: string): boolean {
  const match = ABBREV_TAIL_RE.exec(buffer);
  if (!match) return false;
  const word = match[1].toLowerCase();
  if (ABBREVIATIONS.has(word)) return true;
  if (SINGLE_LETTER_RE.test(word)) return true;
  if (DOTTED_INITIALS_RE.test(word)) return true;
  return false;
}

/**
 * Split a paragraph into sentences while preserving common abbreviations.
 * If the paragraph contains no sentence terminators (or any "sentence" is
 * excessively long), fall back to returning the whole paragraph.
 */
export function splitSentences(paragraph: string): string[] {
  const trimmed = paragraph.trim();
  if (!trimmed) return [];

  const chars = Array.from(trimmed);
  const sentences: string[] = [];
  let buffer = "";

  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    buffer += ch;

    if (ch === "." || ch === "!" || ch === "?") {
      let j = i + 1;
      while (j < chars.length && CLOSING_PUNCT_RE.test(chars[j])) {
        buffer += chars[j];
        j += 1;
      }

      const next = chars[j];
      const afterNext = chars[j + 1];
      const endOfInput = j >= chars.length;
      const isWhitespace = next === " " || next === "\n" || next === "\t";
      const nextStartsUpper =
        typeof afterNext === "string" && SENTENCE_START_RE.test(afterNext);

      if (endOfInput || (isWhitespace && nextStartsUpper)) {
        if (ch === "." && isLikelyAbbreviation(buffer)) {
          i = j - 1;
          continue;
        }
        sentences.push(buffer.trim());
        buffer = "";
        i = j - 1;
      }
    }
  }

  const tail = buffer.trim();
  if (tail) sentences.push(tail);

  const tooLong = sentences.some((s) => s.length > MAX_SENTENCE_CHARS);
  if (tooLong || sentences.length === 0) {
    return [trimmed];
  }
  return sentences;
}

export function splitIntoParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export interface SentenceRef {
  paragraph: number;
  index: number;
  text: string;
}

/**
 * Flatten already-split paragraphs (string[][]) into ordered sentence refs.
 * Use this when the caller already holds the split paragraphs, to avoid
 * re-running the splitter (see prepareSegment).
 */
export function flattenParagraphs(paragraphs: string[][]): SentenceRef[] {
  const sentences: SentenceRef[] = [];
  paragraphs.forEach((sents, paragraphIdx) => {
    sents.forEach((t, index) => {
      sentences.push({ paragraph: paragraphIdx, index, text: t });
    });
  });
  return sentences;
}

/**
 * Flatten a segment's text into an ordered list of sentence references.
 */
export function flattenSentences(text: string): SentenceRef[] {
  return flattenParagraphs(splitIntoParagraphs(text).map(splitSentences));
}
