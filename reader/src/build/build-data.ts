/**
 * build.ts — Scans ../part1/**.md and ../part2/*.md, extracts English sections,
 * and emits public/data.js as `window.LESSONS = [...]`.
 *
 * Source MD conventions (see ../CONTRACT.md):
 *   - Part 1 main & special-topics: multiple `## Q<n>. ...` blocks, each with `### English`.
 *     Segment text = content between `### English` and the next `###`, `---`, or `##`.
 *   - Part 2: single `## English` section; segment text = content until next `##` or EOF.
 *     Label = "English".
 *   - Title = first `# ...` heading.
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { join, basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Group, Lesson, Segment } from "../shared/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const READER_DIR = resolve(__dirname, "../..");
const ROOT_DIR = resolve(READER_DIR, "..");
const PUBLIC_DIR = join(READER_DIR, "public");
const OUT_FILE = join(PUBLIC_DIR, "data.js");

// ────────────────────────────────────────────────────────────────────────────
// File discovery
// ────────────────────────────────────────────────────────────────────────────

const listMarkdownFiles = (dir: string): string[] => {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  return readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith(".md"))
    .map((name) => join(dir, name))
    .sort();
};

// ────────────────────────────────────────────────────────────────────────────
// Markdown cleaning
// ────────────────────────────────────────────────────────────────────────────

/**
 * Strip inline Markdown noise that should not be spoken or shown:
 *   - `*italic*` / `_italic_` → italic
 *   - `**bold**` / `__bold__` → bold
 *   - `` `code` `` → code
 *   - `[text](url)` → text
 *   - leading `> ` blockquote markers
 */
const cleanInline = (line: string): string => {
  let out = line;

  // Strip leading blockquote markers (possibly nested: "> > ")
  out = out.replace(/^\s*(?:>\s?)+/, "");

  // Links: [text](url) → text
  out = out.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");

  // Images: ![alt](url) → alt  (handled above since [alt](url) matches after !)
  out = out.replace(/!\s*/g, (m) => (m.length === 1 ? "" : m)); // safety net; unlikely

  // Bold: **text** or __text__
  out = out.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1");

  // Italic: *text* or _text_ (avoid matching ** already handled)
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1$2");
  out = out.replace(/(^|[^_])_([^_\n]+)_/g, "$1$2");

  // Inline code: `code`
  out = out.replace(/`([^`]*)`/g, "$1");

  return out;
};

/**
 * Convert a raw block of Markdown lines into clean plain text.
 * Paragraphs are separated by blank lines. Within a paragraph,
 * single newlines collapse to a single space.
 */
const normalizeBlock = (raw: string): string => {
  const lines = raw.split(/\r?\n/).map(cleanInline);

  // Split into paragraphs on blank lines.
  const paragraphs: string[] = [];
  let buf: string[] = [];
  for (const line of lines) {
    if (line.trim() === "") {
      if (buf.length > 0) {
        paragraphs.push(buf.join(" ").replace(/\s+/g, " ").trim());
        buf = [];
      }
    } else {
      buf.push(line.trim());
    }
  }
  if (buf.length > 0) {
    paragraphs.push(buf.join(" ").replace(/\s+/g, " ").trim());
  }

  return paragraphs.filter((p) => p.length > 0).join("\n\n");
};

// ────────────────────────────────────────────────────────────────────────────
// Section extraction
// ────────────────────────────────────────────────────────────────────────────

interface Heading {
  readonly level: number;
  readonly text: string;
  readonly lineIndex: number;
}

const parseHeadings = (lines: readonly string[]): Heading[] => {
  const headings: Heading[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]!.match(/^(#{1,6})\s+(.*\S)\s*$/);
    if (m) {
      headings.push({ level: m[1]!.length, text: m[2]!.trim(), lineIndex: i });
    }
  }
  return headings;
};

const extractTitle = (lines: readonly string[]): string => {
  for (const line of lines) {
    const m = line.match(/^#\s+(.*\S)\s*$/);
    if (m) return m[1]!.trim();
  }
  return "(Untitled)";
};

/**
 * Slice lines[start..end) (end exclusive), stopping early at a horizontal rule (`---`).
 * `---` is commonly used as a Q-separator and must not leak into segment text.
 */
const sliceUntilRule = (lines: readonly string[], start: number, end: number): string => {
  const collected: string[] = [];
  for (let i = start; i < end; i++) {
    const line = lines[i]!;
    if (/^\s*-{3,}\s*$/.test(line)) break;
    collected.push(line);
  }
  return collected.join("\n");
};

/** Matches the source heading that introduces a Japanese translation block. */
const JAPANESE_HEADING = /^日本語/;

/**
 * Normalized body text for the section beginning at headings[headingIdx]:
 * everything from the line after that heading until the next heading (any level)
 * or EOF, stopping early at a horizontal rule. Returns "" when empty.
 */
const sectionBody = (
  lines: readonly string[],
  headings: readonly Heading[],
  headingIdx: number,
): string => {
  const heading = headings[headingIdx]!;
  const endLine =
    headingIdx + 1 < headings.length ? headings[headingIdx + 1]!.lineIndex : lines.length;
  return normalizeBlock(sliceUntilRule(lines, heading.lineIndex + 1, endLine));
};

/** Build a Segment, attaching `translation` only when the Japanese body is non-empty. */
const makeSegment = (label: string, text: string, translation: string): Segment =>
  translation.length > 0 ? { label, text, translation } : { label, text };

/**
 * Extract segments from a Part 1 style file (multiple `## Q...` blocks, each with
 * `### 日本語` + `### English`). The English body is spoken; the Japanese body is
 * display-only. Each body runs until the next heading, `---`, or `##`.
 */
const extractPart1Segments = (lines: readonly string[]): Segment[] => {
  const headings = parseHeadings(lines);
  const segments: Segment[] = [];

  for (let i = 0; i < headings.length; i++) {
    const h = headings[i]!;
    if (h.level !== 2) continue;
    // Only treat Q-blocks as segment sources.
    if (!/^Q\d+/i.test(h.text)) continue;

    // Find the `### English` and `### 日本語` subsections inside this Q block.
    const nextTopIdx = headings.findIndex((x, idx) => idx > i && x.level === 2);
    const endIdxExclusive = nextTopIdx === -1 ? headings.length : nextTopIdx;

    let englishIdx = -1;
    let japaneseIdx = -1;
    for (let j = i + 1; j < endIdxExclusive; j++) {
      const sub = headings[j]!;
      if (sub.level !== 3) continue;
      if (englishIdx === -1 && /^english\b/i.test(sub.text)) englishIdx = j;
      if (japaneseIdx === -1 && JAPANESE_HEADING.test(sub.text)) japaneseIdx = j;
    }
    if (englishIdx === -1) continue;

    const text = sectionBody(lines, headings, englishIdx);
    if (text.length === 0) continue;

    const translation = japaneseIdx === -1 ? "" : sectionBody(lines, headings, japaneseIdx);
    segments.push(makeSegment(h.text, text, translation));
  }

  return segments;
};

/**
 * Extract the single `## English` (+ optional `## 日本語`) section from a Part 2 file.
 */
const extractPart2Segments = (lines: readonly string[]): Segment[] => {
  const headings = parseHeadings(lines);
  const englishIdx = headings.findIndex((h) => h.level === 2 && /^english\b/i.test(h.text));
  if (englishIdx === -1) return [];

  const text = sectionBody(lines, headings, englishIdx);
  if (text.length === 0) return [];

  const japaneseIdx = headings.findIndex((h) => h.level === 2 && JAPANESE_HEADING.test(h.text));
  const translation = japaneseIdx === -1 ? "" : sectionBody(lines, headings, japaneseIdx);
  return [makeSegment("English", text, translation)];
};

// ────────────────────────────────────────────────────────────────────────────
// Lesson building
// ────────────────────────────────────────────────────────────────────────────

type SegmentExtractor = (lines: readonly string[]) => Segment[];

const buildLesson = (filePath: string, extractor: SegmentExtractor): Lesson | null => {
  const raw = readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);
  const segments = extractor(lines);
  if (segments.length === 0) return null;

  return {
    title: extractTitle(lines),
    file: basename(filePath),
    segments,
  };
};

const buildGroup = (label: string, dir: string, extractor: SegmentExtractor): Group => {
  const lessons = listMarkdownFiles(dir)
    .map((p) => buildLesson(p, extractor))
    .filter((l): l is Lesson => l !== null);
  return { label, lessons };
};

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────

const main = (): void => {
  const part1Dir = join(ROOT_DIR, "part1");
  const part1SpecialDir = join(part1Dir, "special-topics");
  const part2Dir = join(ROOT_DIR, "part2");

  const groups: Group[] = [
    buildGroup("Part 1", part1Dir, extractPart1Segments),
    buildGroup("Part 1 · special topics", part1SpecialDir, extractPart1Segments),
    buildGroup("Part 2", part2Dir, extractPart2Segments),
  ].filter((g) => g.lessons.length > 0);

  mkdirSync(PUBLIC_DIR, { recursive: true });

  const payload = JSON.stringify(groups, null, 2);
  const banner = "// AUTO-GENERATED by src/build.ts — do not edit by hand.\n";
  writeFileSync(OUT_FILE, `${banner}window.LESSONS = ${payload};\n`, "utf8");

  // Summary
  let totalLessons = 0;
  let totalSegments = 0;
  for (const g of groups) {
    totalLessons += g.lessons.length;
    for (const l of g.lessons) totalSegments += l.segments.length;
  }
  console.log(`[build:data] wrote ${OUT_FILE}`);
  console.log(`[build:data] groups:   ${groups.length}`);
  console.log(`[build:data] lessons:  ${totalLessons}`);
  console.log(`[build:data] segments: ${totalSegments}`);
  for (const g of groups) {
    const segs = g.lessons.reduce((n, l) => n + l.segments.length, 0);
    console.log(`  - ${g.label}: ${g.lessons.length} lessons, ${segs} segments`);
  }
};

main();
